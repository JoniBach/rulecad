# A port of Liu and Tovar (2014)'s top3d.m (the density filter, the OC update as published), for cross-checking
# @rulecad/topopt in 3D. The cantilever: held over its x = 0 face, a unit load down (-y) on each node along the free
# end's bottom edge. Usage: python3 top3d.py nelx nely nelz volfrac rmin
import numpy as np, sys
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

def lk_H8(nu):  # the element stiffness by 2x2x2 Gauss integration (the same matrix as top3d's closed form)
    D = 1 / ((1 + nu) * (1 - 2 * nu)) * np.array([[1 - nu, nu, nu, 0, 0, 0], [nu, 1 - nu, nu, 0, 0, 0], [nu, nu, 1 - nu, 0, 0, 0],
        [0, 0, 0, (1 - 2 * nu) / 2, 0, 0], [0, 0, 0, 0, (1 - 2 * nu) / 2, 0], [0, 0, 0, 0, 0, (1 - 2 * nu) / 2]])
    C = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    g = 1 / np.sqrt(3); K = np.zeros((24, 24))
    for p in [(a, b, c) for a in (-g, g) for b in (-g, g) for c in (-g, g)]:
        B = np.zeros((6, 24))
        for q, c in enumerate(C):
            s = [2 * v - 1 for v in c]
            d = [s[a] * np.prod([1 + s[b] * p[b] for b in range(3) if b != a]) / 8 * 2 for a in range(3)]
            B[0, 3*q] = d[0]; B[1, 3*q+1] = d[1]; B[2, 3*q+2] = d[2]
            B[3, 3*q] = d[1]; B[3, 3*q+1] = d[0]; B[4, 3*q+1] = d[2]; B[4, 3*q+2] = d[1]; B[5, 3*q] = d[2]; B[5, 3*q+2] = d[0]
        K += B.T @ D @ B / 8
    return K

def top3d(nelx, nely, nelz, volfrac, rmin, penal=3.0, E0=1.0, Emin=1e-9, nu=0.3):
    node = lambda i, j, k: (k * (nely + 1) + j) * (nelx + 1) + i
    C = [(0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)]
    nele = nelx * nely * nelz; ndof = 3 * (nelx + 1) * (nely + 1) * (nelz + 1)
    edof = np.zeros((nele, 24), dtype=int)
    for k in range(nelz):
        for j in range(nely):
            for i in range(nelx):
                e = (k * nely + j) * nelx + i
                edof[e] = [3 * node(i + a, j + b, k + c) + d for (a, b, c) in C for d in range(3)]
    KE = lk_H8(nu)
    iK = np.kron(edof, np.ones((24, 1))).flatten(); jK = np.kron(edof, np.ones((1, 24))).flatten()
    F = np.zeros(ndof)
    for k in range(nelz + 1): F[3 * node(nelx, 0, k) + 1] = -1
    fixed = [3 * node(0, j, k) + d for k in range(nelz + 1) for j in range(nely + 1) for d in range(3)]
    free = np.setdiff1d(np.arange(ndof), fixed)
    iH, jH, sH = [], [], []; r = int(np.ceil(rmin)) - 1
    for k in range(nelz):
        for j in range(nely):
            for i in range(nelx):
                e1 = (k * nely + j) * nelx + i
                for c in range(max(k - r, 0), min(k + r, nelz - 1) + 1):
                    for b in range(max(j - r, 0), min(j + r, nely - 1) + 1):
                        for a in range(max(i - r, 0), min(i + r, nelx - 1) + 1):
                            w = rmin - np.sqrt((i - a) ** 2 + (j - b) ** 2 + (k - c) ** 2)
                            if w > 0: iH.append(e1); jH.append((c * nely + b) * nelx + a); sH.append(w)
    H = coo_matrix((sH, (iH, jH)), shape=(nele, nele)).tocsr(); Hs = np.asarray(H.sum(1)).flatten()
    x = np.full(nele, volfrac); xPhys = x.copy(); loop = 0; change = 1; hist = []
    while change > 0.01 and loop < 200:
        loop += 1
        sK = (KE.flatten()[:, None] * (Emin + xPhys ** penal * (E0 - Emin))).flatten(order='F')
        K = coo_matrix((sK, (iK, jK)), shape=(ndof, ndof)).tocsc(); K = (K + K.T) / 2
        U = np.zeros(ndof); U[free] = spsolve(K[free][:, free], F[free])
        ue = U[edof]; ce = np.sum(ue @ KE * ue, axis=1)
        c = np.sum((Emin + xPhys ** penal * (E0 - Emin)) * ce); hist.append(c)
        dc = H @ (-penal * (E0 - Emin) * xPhys ** (penal - 1) * ce / Hs); dv = H @ (np.ones(nele) / Hs)
        l1, l2, move = 0, 1e9, 0.2
        while (l2 - l1) / (l1 + l2) > 1e-3:
            lmid = 0.5 * (l2 + l1)
            xnew = np.maximum(0, np.maximum(x - move, np.minimum(1, np.minimum(x + move, x * np.sqrt(-dc / dv / lmid)))))
            xPhys = (H @ xnew) / Hs
            if xPhys.sum() > volfrac * nele: l1 = lmid
            else: l2 = lmid
        change = np.abs(xnew - x).max(); x = xnew
    return hist, loop

hist, loop = top3d(int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5]))
print('c %.4f loops %d first %.4f' % (hist[-1], loop, hist[0]))

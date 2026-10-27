# A line-by-line port of Andreassen et al. (2011) top88.m, for cross-checking. ft: 1 sensitivity, 2 density filter.
import numpy as np, sys
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
def top88(nelx, nely, volfrac, penal, rmin, ft, case='mbb'):
    E0, Emin, nu = 1, 1e-9, 0.3
    A11 = np.array([[12,3,-6,-3],[3,12,3,0],[-6,3,12,-3],[-3,0,-3,12]])
    A12 = np.array([[-6,-3,0,3],[-3,-6,-3,-6],[0,-3,-6,3],[3,-6,3,-6]])
    B11 = np.array([[-4,3,-2,9],[3,-4,-9,4],[-2,-9,-4,-3],[9,4,-3,-4]])
    B12 = np.array([[2,-3,4,-9],[-3,2,9,-2],[4,9,2,3],[-9,-2,3,2]])
    KE = 1/(1-nu**2)/24*(np.block([[A11,A12],[A12.T,A11]])+nu*np.block([[B11,B12],[B12.T,B11]]))
    nodenrs = np.arange(1,(1+nelx)*(1+nely)+1).reshape((1+nely,1+nelx),order='F')
    edofVec = (2*nodenrs[:-1,:-1]+1).reshape(nelx*nely,order='F')
    edofMat = edofVec[:,None] + np.array([0,1,2*nely+2,2*nely+3,2*nely+0,2*nely+1,-2,-1])[None,:]
    iK = np.kron(edofMat,np.ones((8,1))).flatten(); jK = np.kron(edofMat,np.ones((1,8))).flatten()
    ndof = 2*(nelx+1)*(nely+1)
    F = np.zeros(ndof)
    if case == 'mbb':  # top88.m as published: half the beam, load at the top left, roller at the bottom right
        F[1] = -1  # MATLAB F(2,1) = -1
        fixeddofs = np.union1d(np.arange(1,2*(nely+1)+1,2), [2*(nelx+1)*(nely+1)])
    else:  # the paper's section 5.1 cantilever: left edge held, load at the middle of the right edge
        F[2*(nelx+1)*(nely+1)-nely-1] = -1  # MATLAB F(2*(nelx+1)*(nely+1)-nely, 1) = -1
        fixeddofs = np.arange(1,2*(nely+1)+1)
    freedofs = np.setdiff1d(np.arange(1,ndof+1), fixeddofs) - 1
    iH, jH, sH = [], [], []
    for i1 in range(1,nelx+1):
        for j1 in range(1,nely+1):
            e1 = (i1-1)*nely+j1
            for i2 in range(max(i1-(int(np.ceil(rmin))-1),1), min(i1+(int(np.ceil(rmin))-1),nelx)+1):
                for j2 in range(max(j1-(int(np.ceil(rmin))-1),1), min(j1+(int(np.ceil(rmin))-1),nely)+1):
                    e2 = (i2-1)*nely+j2
                    iH.append(e1-1); jH.append(e2-1); sH.append(max(0,rmin-np.sqrt((i1-i2)**2+(j1-j2)**2)))
    H = coo_matrix((sH,(iH,jH)),shape=(nelx*nely,nelx*nely)).tocsr(); Hs = np.asarray(H.sum(1)).flatten()
    x = np.full(nely*nelx, volfrac)  # column-major element order
    xPhys = x.copy(); loop = 0; change = 1; hist = []
    while change > 0.01:
        loop += 1
        sK = (KE.flatten()[:,None]*(Emin+xPhys**penal*(E0-Emin))).flatten(order='F')
        K = coo_matrix((sK,(iK-1,jK-1)),shape=(ndof,ndof)).tocsc(); K = (K+K.T)/2
        U = np.zeros(ndof); U[freedofs] = spsolve(K[freedofs][:,freedofs], F[freedofs])
        ue = U[edofMat-1]; ce = np.sum(ue@KE*ue, axis=1)
        c = np.sum((Emin+xPhys**penal*(E0-Emin))*ce)
        dc = -penal*(E0-Emin)*xPhys**(penal-1)*ce; dv = np.ones(nely*nelx)
        if ft == 1: dc = H@(x*dc)/Hs/np.maximum(1e-3,x)
        else: dc = H@(dc/Hs); dv = H@(dv/Hs)
        l1, l2, move = 0, 1e9, 0.2
        while (l2-l1)/(l1+l2) > 1e-3:
            lmid = 0.5*(l2+l1)
            xnew = np.maximum(0,np.maximum(x-move,np.minimum(1,np.minimum(x+move,x*np.sqrt(-dc/dv/lmid)))))
            xPhys = xnew if ft == 1 else (H@xnew)/Hs
            if xPhys.sum() > volfrac*nelx*nely: l1 = lmid
            else: l2 = lmid
        change = np.abs(xnew-x).max(); x = xnew; hist.append(c)
    return c, loop, hist, xPhys.reshape((nely,nelx),order='F')
c, loop, hist, xp = top88(int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3]), 3, float(sys.argv[4]), 2, sys.argv[5])
print('c %.4f loops %d first %.4f' % (c, loop, hist[0]))
for row in xp: print(''.join('#' if v > 0.5 else '.' for v in row))

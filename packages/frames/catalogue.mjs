// The rule sets @rulecad/frames reads, by name: every profile, slot family and slot nut in @rulecad/rules, the threads
// their bores tap to and the materials they name. Generated from the rules package (one import per set, so a bundler
// can see them): after adding a set there, add its line here. A test holds the two together.
import s_al6060_rexroth from '@rulecad/rules/al6060-rexroth.json' with { type: 'json' };
import s_al6063_t5 from '@rulecad/rules/al6063-t5.json' with { type: 'json' };
import s_al6063_t66 from '@rulecad/rules/al6063-t66.json' with { type: 'json' };
import s_al6n01_t5 from '@rulecad/rules/al6n01-t5.json' with { type: 'json' };
import s_m10 from '@rulecad/rules/m10.json' with { type: 'json' };
import s_m12 from '@rulecad/rules/m12.json' with { type: 'json' };
import s_m1_6 from '@rulecad/rules/m1_6.json' with { type: 'json' };
import s_m2 from '@rulecad/rules/m2.json' with { type: 'json' };
import s_m2_5 from '@rulecad/rules/m2_5.json' with { type: 'json' };
import s_m3 from '@rulecad/rules/m3.json' with { type: 'json' };
import s_m4 from '@rulecad/rules/m4.json' with { type: 'json' };
import s_m5 from '@rulecad/rules/m5.json' with { type: 'json' };
import s_m6 from '@rulecad/rules/m6.json' with { type: 'json' };
import s_m8 from '@rulecad/rules/m8.json' with { type: 'json' };
import s_profile_2020_bosch from '@rulecad/rules/profile-2020-bosch.json' with { type: 'json' };
import s_profile_2020_generic from '@rulecad/rules/profile-2020-generic.json' with { type: 'json' };
import s_profile_2020_misumi_hfs5 from '@rulecad/rules/profile-2020-misumi-hfs5.json' with { type: 'json' };
import s_profile_2020_motedis_b6 from '@rulecad/rules/profile-2020-motedis-b6.json' with { type: 'json' };
import s_profile_2040_bosch from '@rulecad/rules/profile-2040-bosch.json' with { type: 'json' };
import s_profile_2040_generic from '@rulecad/rules/profile-2040-generic.json' with { type: 'json' };
import s_profile_2040_misumi_hfs5 from '@rulecad/rules/profile-2040-misumi-hfs5.json' with { type: 'json' };
import s_profile_3030_bosch from '@rulecad/rules/profile-3030-bosch.json' with { type: 'json' };
import s_profile_3030_generic from '@rulecad/rules/profile-3030-generic.json' with { type: 'json' };
import s_profile_3030_misumi_hfs6 from '@rulecad/rules/profile-3030-misumi-hfs6.json' with { type: 'json' };
import s_profile_3060_misumi_hfs6 from '@rulecad/rules/profile-3060-misumi-hfs6.json' with { type: 'json' };
import s_profile_4040_bosch_l from '@rulecad/rules/profile-4040-bosch-l.json' with { type: 'json' };
import s_profile_4040_generic from '@rulecad/rules/profile-4040-generic.json' with { type: 'json' };
import s_profile_4040_misumi_hfs8 from '@rulecad/rules/profile-4040-misumi-hfs8.json' with { type: 'json' };
import s_profile_4040_motedis_b10 from '@rulecad/rules/profile-4040-motedis-b10.json' with { type: 'json' };
import s_profile_4080_misumi_hfs8 from '@rulecad/rules/profile-4080-misumi-hfs8.json' with { type: 'json' };
import s_profile_4545_misumi_hfs8 from '@rulecad/rules/profile-4545-misumi-hfs8.json' with { type: 'json' };
import s_profile_4590_misumi_hfs8 from '@rulecad/rules/profile-4590-misumi-hfs8.json' with { type: 'json' };
import s_slot_10_bosch from '@rulecad/rules/slot-10-bosch.json' with { type: 'json' };
import s_slot_10_misumi_45 from '@rulecad/rules/slot-10-misumi-45.json' with { type: 'json' };
import s_slot_10_misumi from '@rulecad/rules/slot-10-misumi.json' with { type: 'json' };
import s_slot_10_motedis from '@rulecad/rules/slot-10-motedis.json' with { type: 'json' };
import s_slot_6_bosch from '@rulecad/rules/slot-6-bosch.json' with { type: 'json' };
import s_slot_6_misumi from '@rulecad/rules/slot-6-misumi.json' with { type: 'json' };
import s_slot_6_motedis from '@rulecad/rules/slot-6-motedis.json' with { type: 'json' };
import s_slot_6 from '@rulecad/rules/slot-6.json' with { type: 'json' };
import s_slot_8_bosch from '@rulecad/rules/slot-8-bosch.json' with { type: 'json' };
import s_slot_8_i from '@rulecad/rules/slot-8-i.json' with { type: 'json' };
import s_slot_8_misumi from '@rulecad/rules/slot-8-misumi.json' with { type: 'json' };
import s_slot_8 from '@rulecad/rules/slot-8.json' with { type: 'json' };
import s_unc_10_24 from '@rulecad/rules/unc_10_24.json' with { type: 'json' };
import s_unc_1_4_20 from '@rulecad/rules/unc_1_4_20.json' with { type: 'json' };
import s_unc_3_8_16 from '@rulecad/rules/unc_3_8_16.json' with { type: 'json' };
import s_unc_4_40 from '@rulecad/rules/unc_4_40.json' with { type: 'json' };
import s_unc_5_16_18 from '@rulecad/rules/unc_5_16_18.json' with { type: 'json' };
import s_unc_6_32 from '@rulecad/rules/unc_6_32.json' with { type: 'json' };
import s_unc_8_32 from '@rulecad/rules/unc_8_32.json' with { type: 'json' };
import s_unf_10_32 from '@rulecad/rules/unf_10_32.json' with { type: 'json' };
import vocabulary from '@rulecad/rules/vocabulary.json' with { type: 'json' };

/** The names a profile, a slot and a slot nut are written in: the fields of vocabulary.json. @type {Record<string, { unit?: string, choice?: string[], list?: boolean, says: string }>} */
export const FIELDS = vocabulary.fields;
/** Every rule set frames knows, by its name. @type {Record<string, { name: string, part?: string, rules: Record<string, any> }>} */
export const SETS = Object.fromEntries([
  s_al6060_rexroth, s_al6063_t5, s_al6063_t66, s_al6n01_t5, s_m10, s_m12, s_m1_6, s_m2, s_m2_5, s_m3, s_m4,
  s_m5, s_m6, s_m8, s_profile_2020_bosch, s_profile_2020_generic, s_profile_2020_misumi_hfs5, s_profile_2020_motedis_b6,
  s_profile_2040_bosch, s_profile_2040_generic, s_profile_2040_misumi_hfs5, s_profile_3030_bosch, s_profile_3030_generic,
  s_profile_3030_misumi_hfs6, s_profile_3060_misumi_hfs6, s_profile_4040_bosch_l, s_profile_4040_generic,
  s_profile_4040_misumi_hfs8, s_profile_4040_motedis_b10, s_profile_4080_misumi_hfs8, s_profile_4545_misumi_hfs8,
  s_profile_4590_misumi_hfs8, s_slot_10_bosch, s_slot_10_misumi_45, s_slot_10_misumi, s_slot_10_motedis,
  s_slot_6_bosch, s_slot_6_misumi, s_slot_6_motedis, s_slot_6, s_slot_8_bosch, s_slot_8_i, s_slot_8_misumi,
  s_slot_8, s_unc_10_24, s_unc_1_4_20, s_unc_3_8_16, s_unc_4_40, s_unc_5_16_18, s_unc_6_32, s_unc_8_32,
  s_unf_10_32
].map((s) => [s.name, s]));

// The rule sets @rulecad/frames reads, by name: every profile, slot family, slot nut and bought fitting in @rulecad/rules, the threads
// their bores tap to, the materials they name and the outlines the kit draws itself. Generated from the rules package (one import per set, so a bundler
// can see them): after adding a set there, add its line here. A test holds the two together.
import s_al6000_item from '@rulecad/rules/al6000-item.json' with { type: 'json' };
import s_al6005a_8020 from '@rulecad/rules/al6005a-8020.json' with { type: 'json' };
import s_al6060_rexroth from '@rulecad/rules/al6060-rexroth.json' with { type: 'json' };
import s_al6063_t5 from '@rulecad/rules/al6063-t5.json' with { type: 'json' };
import s_al6063_t66 from '@rulecad/rules/al6063-t66.json' with { type: 'json' };
import s_al6n01_t5 from '@rulecad/rules/al6n01-t5.json' with { type: 'json' };
import s_fitting_misumi_hmj5 from '@rulecad/rules/fitting-misumi-hmj5.json' with { type: 'json' };
import s_fitting_motedis_bracket_20_b6 from '@rulecad/rules/fitting-motedis-bracket-20-b6.json' with { type: 'json' };
import s_fitting_motedis_end_cap_20_b6 from '@rulecad/rules/fitting-motedis-end-cap-20-b6.json' with { type: 'json' };
import s_fitting_motedis_foot_m6_d19 from '@rulecad/rules/fitting-motedis-foot-m6-d19.json' with { type: 'json' };
import s_fitting_motedis_hinge_20 from '@rulecad/rules/fitting-motedis-hinge-20.json' with { type: 'json' };
import s_fitting_motedis_inner_20_b6 from '@rulecad/rules/fitting-motedis-inner-20-b6.json' with { type: 'json' };
import s_fitting_motedis_plate_t_20 from '@rulecad/rules/fitting-motedis-plate-t-20.json' with { type: 'json' };
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
import s_profile_1010_8020 from '@rulecad/rules/profile-1010-8020.json' with { type: 'json' };
import s_profile_1010_makerbeam from '@rulecad/rules/profile-1010-makerbeam.json' with { type: 'json' };
import s_profile_1020_8020 from '@rulecad/rules/profile-1020-8020.json' with { type: 'json' };
import s_profile_1515_8020 from '@rulecad/rules/profile-1515-8020.json' with { type: 'json' };
import s_profile_1515_makerbeam_xl from '@rulecad/rules/profile-1515-makerbeam-xl.json' with { type: 'json' };
import s_profile_1515_openbeam from '@rulecad/rules/profile-1515-openbeam.json' with { type: 'json' };
import s_profile_1530_8020 from '@rulecad/rules/profile-1530-8020.json' with { type: 'json' };
import s_profile_2020_bosch from '@rulecad/rules/profile-2020-bosch.json' with { type: 'json' };
import s_profile_2020_generic from '@rulecad/rules/profile-2020-generic.json' with { type: 'json' };
import s_profile_2020_item_5 from '@rulecad/rules/profile-2020-item-5.json' with { type: 'json' };
import s_profile_2020_misumi_hfs5 from '@rulecad/rules/profile-2020-misumi-hfs5.json' with { type: 'json' };
import s_profile_2020_motedis_b6 from '@rulecad/rules/profile-2020-motedis-b6.json' with { type: 'json' };
import s_profile_2020_motedis_i5 from '@rulecad/rules/profile-2020-motedis-i5.json' with { type: 'json' };
import s_profile_2020_openbuilds from '@rulecad/rules/profile-2020-openbuilds.json' with { type: 'json' };
import s_profile_2040_bosch from '@rulecad/rules/profile-2040-bosch.json' with { type: 'json' };
import s_profile_2040_generic from '@rulecad/rules/profile-2040-generic.json' with { type: 'json' };
import s_profile_2040_item_5 from '@rulecad/rules/profile-2040-item-5.json' with { type: 'json' };
import s_profile_2040_misumi_hfs5 from '@rulecad/rules/profile-2040-misumi-hfs5.json' with { type: 'json' };
import s_profile_2040_motedis_i5 from '@rulecad/rules/profile-2040-motedis-i5.json' with { type: 'json' };
import s_profile_2040_openbuilds from '@rulecad/rules/profile-2040-openbuilds.json' with { type: 'json' };
import s_profile_2060_misumi_hfs5 from '@rulecad/rules/profile-2060-misumi-hfs5.json' with { type: 'json' };
import s_profile_2060_openbuilds from '@rulecad/rules/profile-2060-openbuilds.json' with { type: 'json' };
import s_profile_2080_misumi_hfs5 from '@rulecad/rules/profile-2080-misumi-hfs5.json' with { type: 'json' };
import s_profile_2080_openbuilds from '@rulecad/rules/profile-2080-openbuilds.json' with { type: 'json' };
import s_profile_3030_bosch from '@rulecad/rules/profile-3030-bosch.json' with { type: 'json' };
import s_profile_3030_generic from '@rulecad/rules/profile-3030-generic.json' with { type: 'json' };
import s_profile_3030_item_6 from '@rulecad/rules/profile-3030-item-6.json' with { type: 'json' };
import s_profile_3030_item_6l from '@rulecad/rules/profile-3030-item-6l.json' with { type: 'json' };
import s_profile_3030_misumi_hfs6 from '@rulecad/rules/profile-3030-misumi-hfs6.json' with { type: 'json' };
import s_profile_3030_motedis_i6 from '@rulecad/rules/profile-3030-motedis-i6.json' with { type: 'json' };
import s_profile_3060_bosch from '@rulecad/rules/profile-3060-bosch.json' with { type: 'json' };
import s_profile_3060_item_6 from '@rulecad/rules/profile-3060-item-6.json' with { type: 'json' };
import s_profile_3060_item_6l from '@rulecad/rules/profile-3060-item-6l.json' with { type: 'json' };
import s_profile_3060_misumi_hfs6 from '@rulecad/rules/profile-3060-misumi-hfs6.json' with { type: 'json' };
import s_profile_4040_bosch_l from '@rulecad/rules/profile-4040-bosch-l.json' with { type: 'json' };
import s_profile_4040_generic from '@rulecad/rules/profile-4040-generic.json' with { type: 'json' };
import s_profile_4040_item_8 from '@rulecad/rules/profile-4040-item-8.json' with { type: 'json' };
import s_profile_4040_item_8l from '@rulecad/rules/profile-4040-item-8l.json' with { type: 'json' };
import s_profile_4040_misumi_hfs8 from '@rulecad/rules/profile-4040-misumi-hfs8.json' with { type: 'json' };
import s_profile_4040_motedis_b10 from '@rulecad/rules/profile-4040-motedis-b10.json' with { type: 'json' };
import s_profile_4040_motedis_i8 from '@rulecad/rules/profile-4040-motedis-i8.json' with { type: 'json' };
import s_profile_4080_bosch_l from '@rulecad/rules/profile-4080-bosch-l.json' with { type: 'json' };
import s_profile_4080_item_8 from '@rulecad/rules/profile-4080-item-8.json' with { type: 'json' };
import s_profile_4080_item_8l from '@rulecad/rules/profile-4080-item-8l.json' with { type: 'json' };
import s_profile_4080_misumi_hfs8 from '@rulecad/rules/profile-4080-misumi-hfs8.json' with { type: 'json' };
import s_profile_4080_motedis_i8 from '@rulecad/rules/profile-4080-motedis-i8.json' with { type: 'json' };
import s_profile_4080_openbuilds_cbeam from '@rulecad/rules/profile-4080-openbuilds-cbeam.json' with { type: 'json' };
import s_profile_4545_bosch_l from '@rulecad/rules/profile-4545-bosch-l.json' with { type: 'json' };
import s_profile_4545_misumi_hfs8 from '@rulecad/rules/profile-4545-misumi-hfs8.json' with { type: 'json' };
import s_profile_4590_misumi_hfs8 from '@rulecad/rules/profile-4590-misumi-hfs8.json' with { type: 'json' };
import s_profile_angle_al_25x25x3 from '@rulecad/rules/profile-angle-al-25x25x3.json' with { type: 'json' };
import s_profile_angle_steel_30x30x3 from '@rulecad/rules/profile-angle-steel-30x30x3.json' with { type: 'json' };
import s_profile_angle from '@rulecad/rules/profile-angle.json' with { type: 'json' };
import s_profile_bar_al_25x5 from '@rulecad/rules/profile-bar-al-25x5.json' with { type: 'json' };
import s_profile_bar_steel_30x5 from '@rulecad/rules/profile-bar-steel-30x5.json' with { type: 'json' };
import s_profile_bar from '@rulecad/rules/profile-bar.json' with { type: 'json' };
import s_profile_channel_al_30x20x2 from '@rulecad/rules/profile-channel-al-30x20x2.json' with { type: 'json' };
import s_profile_channel from '@rulecad/rules/profile-channel.json' with { type: 'json' };
import s_profile_custom from '@rulecad/rules/profile-custom.json' with { type: 'json' };
import s_profile_round_bar_al_10 from '@rulecad/rules/profile-round-bar-al-10.json' with { type: 'json' };
import s_profile_round_bar_steel_10 from '@rulecad/rules/profile-round-bar-steel-10.json' with { type: 'json' };
import s_profile_round_bar from '@rulecad/rules/profile-round-bar.json' with { type: 'json' };
import s_profile_round_tube_al_25x2 from '@rulecad/rules/profile-round-tube-al-25x2.json' with { type: 'json' };
import s_profile_round_tube_steel_25x2 from '@rulecad/rules/profile-round-tube-steel-25x2.json' with { type: 'json' };
import s_profile_round_tube from '@rulecad/rules/profile-round-tube.json' with { type: 'json' };
import s_profile_tube_al_20x20x2 from '@rulecad/rules/profile-tube-al-20x20x2.json' with { type: 'json' };
import s_profile_tube_al_25x25x2 from '@rulecad/rules/profile-tube-al-25x25x2.json' with { type: 'json' };
import s_profile_tube_al_40x20x2 from '@rulecad/rules/profile-tube-al-40x20x2.json' with { type: 'json' };
import s_profile_tube_steel_25x25x2 from '@rulecad/rules/profile-tube-steel-25x25x2.json' with { type: 'json' };
import s_profile_tube_steel_40x40x2 from '@rulecad/rules/profile-tube-steel-40x40x2.json' with { type: 'json' };
import s_profile_tube from '@rulecad/rules/profile-tube.json' with { type: 'json' };
import s_s275 from '@rulecad/rules/s275.json' with { type: 'json' };
import s_slot_10_bosch_45l from '@rulecad/rules/slot-10-bosch-45l.json' with { type: 'json' };
import s_slot_10_bosch from '@rulecad/rules/slot-10-bosch.json' with { type: 'json' };
import s_slot_10_misumi_45 from '@rulecad/rules/slot-10-misumi-45.json' with { type: 'json' };
import s_slot_10_misumi from '@rulecad/rules/slot-10-misumi.json' with { type: 'json' };
import s_slot_10_motedis from '@rulecad/rules/slot-10-motedis.json' with { type: 'json' };
import s_slot_10 from '@rulecad/rules/slot-10.json' with { type: 'json' };
import s_slot_3_makerbeam_xl from '@rulecad/rules/slot-3-makerbeam-xl.json' with { type: 'json' };
import s_slot_3_makerbeam from '@rulecad/rules/slot-3-makerbeam.json' with { type: 'json' };
import s_slot_3_openbeam from '@rulecad/rules/slot-3-openbeam.json' with { type: 'json' };
import s_slot_5_item from '@rulecad/rules/slot-5-item.json' with { type: 'json' };
import s_slot_5_motedis from '@rulecad/rules/slot-5-motedis.json' with { type: 'json' };
import s_slot_6_8020 from '@rulecad/rules/slot-6-8020.json' with { type: 'json' };
import s_slot_6_bosch from '@rulecad/rules/slot-6-bosch.json' with { type: 'json' };
import s_slot_6_item_light from '@rulecad/rules/slot-6-item-light.json' with { type: 'json' };
import s_slot_6_item from '@rulecad/rules/slot-6-item.json' with { type: 'json' };
import s_slot_6_misumi from '@rulecad/rules/slot-6-misumi.json' with { type: 'json' };
import s_slot_6_motedis_i from '@rulecad/rules/slot-6-motedis-i.json' with { type: 'json' };
import s_slot_6_motedis from '@rulecad/rules/slot-6-motedis.json' with { type: 'json' };
import s_slot_6_openbuilds from '@rulecad/rules/slot-6-openbuilds.json' with { type: 'json' };
import s_slot_6 from '@rulecad/rules/slot-6.json' with { type: 'json' };
import s_slot_8_8020 from '@rulecad/rules/slot-8-8020.json' with { type: 'json' };
import s_slot_8_bosch from '@rulecad/rules/slot-8-bosch.json' with { type: 'json' };
import s_slot_8_i from '@rulecad/rules/slot-8-i.json' with { type: 'json' };
import s_slot_8_item_light from '@rulecad/rules/slot-8-item-light.json' with { type: 'json' };
import s_slot_8_item from '@rulecad/rules/slot-8-item.json' with { type: 'json' };
import s_slot_8_misumi from '@rulecad/rules/slot-8-misumi.json' with { type: 'json' };
import s_slot_8_motedis_i from '@rulecad/rules/slot-8-motedis-i.json' with { type: 'json' };
import s_slot_8 from '@rulecad/rules/slot-8.json' with { type: 'json' };
import s_slot_nut_6_bosch_m3_roll_in from '@rulecad/rules/slot-nut-6-bosch-m3-roll-in.json' with { type: 'json' };
import s_slot_nut_6_bosch_m4_drop_in from '@rulecad/rules/slot-nut-6-bosch-m4-drop-in.json' with { type: 'json' };
import s_slot_nut_6_bosch_m4_roll_in from '@rulecad/rules/slot-nut-6-bosch-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_6_bosch_m4_slide_in from '@rulecad/rules/slot-nut-6-bosch-m4-slide-in.json' with { type: 'json' };
import s_slot_nut_6_bosch_m5_roll_in from '@rulecad/rules/slot-nut-6-bosch-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_6_bosch_m5_slide_in from '@rulecad/rules/slot-nut-6-bosch-m5-slide-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m3_drop_in from '@rulecad/rules/slot-nut-6-misumi-m3-drop-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m3_roll_in from '@rulecad/rules/slot-nut-6-misumi-m3-roll-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m3_slide_in from '@rulecad/rules/slot-nut-6-misumi-m3-slide-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m3_square from '@rulecad/rules/slot-nut-6-misumi-m3-square.json' with { type: 'json' };
import s_slot_nut_6_misumi_m4_drop_in from '@rulecad/rules/slot-nut-6-misumi-m4-drop-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m4_roll_in from '@rulecad/rules/slot-nut-6-misumi-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m4_slide_in from '@rulecad/rules/slot-nut-6-misumi-m4-slide-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m4_square from '@rulecad/rules/slot-nut-6-misumi-m4-square.json' with { type: 'json' };
import s_slot_nut_6_misumi_m5_roll_in from '@rulecad/rules/slot-nut-6-misumi-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m5_slide_in from '@rulecad/rules/slot-nut-6-misumi-m5-slide-in.json' with { type: 'json' };
import s_slot_nut_6_misumi_m5_square from '@rulecad/rules/slot-nut-6-misumi-m5-square.json' with { type: 'json' };
import s_slot_nut_6_motedis_m4_hammer from '@rulecad/rules/slot-nut-6-motedis-m4-hammer.json' with { type: 'json' };
import s_slot_nut_6_motedis_m5_hammer from '@rulecad/rules/slot-nut-6-motedis-m5-hammer.json' with { type: 'json' };
import s_slot_nut_6_motedis_m5_slide_in from '@rulecad/rules/slot-nut-6-motedis-m5-slide-in.json' with { type: 'json' };
import s_slot_nut_6_motedis_m5_square from '@rulecad/rules/slot-nut-6-motedis-m5-square.json' with { type: 'json' };
import s_slot_nut_6_openbuilds_m5_drop_in from '@rulecad/rules/slot-nut-6-openbuilds-m5-drop-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m4_drop_in from '@rulecad/rules/slot-nut-8-bosch-m4-drop-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m4_roll_in from '@rulecad/rules/slot-nut-8-bosch-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m4_slide_in from '@rulecad/rules/slot-nut-8-bosch-m4-slide-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m5_drop_in from '@rulecad/rules/slot-nut-8-bosch-m5-drop-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m5_roll_in from '@rulecad/rules/slot-nut-8-bosch-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m5_slide_in from '@rulecad/rules/slot-nut-8-bosch-m5-slide-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m6_drop_in from '@rulecad/rules/slot-nut-8-bosch-m6-drop-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m6_roll_in from '@rulecad/rules/slot-nut-8-bosch-m6-roll-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m6_slide_in from '@rulecad/rules/slot-nut-8-bosch-m6-slide-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m6_t_bolt from '@rulecad/rules/slot-nut-8-bosch-m6-t-bolt.json' with { type: 'json' };
import s_slot_nut_8_bosch_m8_roll_in from '@rulecad/rules/slot-nut-8-bosch-m8-roll-in.json' with { type: 'json' };
import s_slot_nut_8_bosch_m8_slide_in from '@rulecad/rules/slot-nut-8-bosch-m8-slide-in.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m4_hammer from '@rulecad/rules/slot-nut-8-i-motedis-m4-hammer.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m4_roll_in from '@rulecad/rules/slot-nut-8-i-motedis-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m5_hammer from '@rulecad/rules/slot-nut-8-i-motedis-m5-hammer.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m5_roll_in from '@rulecad/rules/slot-nut-8-i-motedis-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m6_hammer from '@rulecad/rules/slot-nut-8-i-motedis-m6-hammer.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m6_roll_in from '@rulecad/rules/slot-nut-8-i-motedis-m6-roll-in.json' with { type: 'json' };
import s_slot_nut_8_i_motedis_m8_roll_in from '@rulecad/rules/slot-nut-8-i-motedis-m8-roll-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m3_drop_in from '@rulecad/rules/slot-nut-8-misumi-m3-drop-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m3_roll_in from '@rulecad/rules/slot-nut-8-misumi-m3-roll-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m3_slide_in from '@rulecad/rules/slot-nut-8-misumi-m3-slide-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m4_drop_in from '@rulecad/rules/slot-nut-8-misumi-m4-drop-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m4_roll_in from '@rulecad/rules/slot-nut-8-misumi-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m4_slide_in from '@rulecad/rules/slot-nut-8-misumi-m4-slide-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m4_square from '@rulecad/rules/slot-nut-8-misumi-m4-square.json' with { type: 'json' };
import s_slot_nut_8_misumi_m5_drop_in from '@rulecad/rules/slot-nut-8-misumi-m5-drop-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m5_roll_in from '@rulecad/rules/slot-nut-8-misumi-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m5_slide_in from '@rulecad/rules/slot-nut-8-misumi-m5-slide-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m5_square from '@rulecad/rules/slot-nut-8-misumi-m5-square.json' with { type: 'json' };
import s_slot_nut_8_misumi_m6_drop_in from '@rulecad/rules/slot-nut-8-misumi-m6-drop-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m6_roll_in from '@rulecad/rules/slot-nut-8-misumi-m6-roll-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m6_slide_in from '@rulecad/rules/slot-nut-8-misumi-m6-slide-in.json' with { type: 'json' };
import s_slot_nut_8_misumi_m6_square from '@rulecad/rules/slot-nut-8-misumi-m6-square.json' with { type: 'json' };
import s_slot_nut_8_motedis_m4_hammer from '@rulecad/rules/slot-nut-8-motedis-m4-hammer.json' with { type: 'json' };
import s_slot_nut_8_motedis_m4_roll_in from '@rulecad/rules/slot-nut-8-motedis-m4-roll-in.json' with { type: 'json' };
import s_slot_nut_8_motedis_m5_hammer from '@rulecad/rules/slot-nut-8-motedis-m5-hammer.json' with { type: 'json' };
import s_slot_nut_8_motedis_m5_roll_in from '@rulecad/rules/slot-nut-8-motedis-m5-roll-in.json' with { type: 'json' };
import s_slot_nut_8_motedis_m6_hammer from '@rulecad/rules/slot-nut-8-motedis-m6-hammer.json' with { type: 'json' };
import s_slot_nut_8_motedis_m6_roll_in from '@rulecad/rules/slot-nut-8-motedis-m6-roll-in.json' with { type: 'json' };
import s_slot_nut_8_motedis_m8_roll_in from '@rulecad/rules/slot-nut-8-motedis-m8-roll-in.json' with { type: 'json' };
import s_unc_10_24 from '@rulecad/rules/unc_10_24.json' with { type: 'json' };
import s_unc_1_4_20 from '@rulecad/rules/unc_1_4_20.json' with { type: 'json' };
import s_unc_3_8_16 from '@rulecad/rules/unc_3_8_16.json' with { type: 'json' };
import s_unc_4_40 from '@rulecad/rules/unc_4_40.json' with { type: 'json' };
import s_unc_5_16_18 from '@rulecad/rules/unc_5_16_18.json' with { type: 'json' };
import s_unc_6_32 from '@rulecad/rules/unc_6_32.json' with { type: 'json' };
import s_unc_8_32 from '@rulecad/rules/unc_8_32.json' with { type: 'json' };
import s_unf_10_32 from '@rulecad/rules/unf_10_32.json' with { type: 'json' };
import o_profile_custom from '@rulecad/rules/outlines/profile-custom.json' with { type: 'json' };
import vocabulary from '@rulecad/rules/vocabulary.json' with { type: 'json' };

/** The names a profile, a slot and a slot nut are written in: the fields of vocabulary.json. @type {Record<string, { unit?: string, choice?: string[], list?: boolean, says: string }>} */
export const FIELDS = vocabulary.fields;
/** Every rule set frames knows, by its name. @type {Record<string, { name: string, part?: string, rules: Record<string, any> }>} */
export const SETS = Object.fromEntries([
  s_al6000_item, s_al6005a_8020, s_fitting_misumi_hmj5, s_fitting_motedis_bracket_20_b6, s_fitting_motedis_end_cap_20_b6, s_fitting_motedis_foot_m6_d19, s_fitting_motedis_hinge_20, s_fitting_motedis_inner_20_b6, s_fitting_motedis_plate_t_20,
  s_al6060_rexroth, s_al6063_t5, s_al6063_t66, s_al6n01_t5, s_m10, s_m12,
  s_m1_6, s_m2, s_m2_5, s_m3, s_m4, s_m5, s_m6, s_m8, s_profile_1010_8020, s_profile_1010_makerbeam, s_profile_1020_8020,
  s_profile_1515_8020, s_profile_1515_makerbeam_xl, s_profile_1515_openbeam, s_profile_1530_8020, s_profile_2020_bosch,
  s_profile_2020_generic, s_profile_2020_item_5, s_profile_2020_misumi_hfs5, s_profile_2020_motedis_b6,
  s_profile_2020_motedis_i5, s_profile_2020_openbuilds, s_profile_2040_bosch, s_profile_2040_generic, s_profile_2040_item_5,
  s_profile_2040_misumi_hfs5, s_profile_2040_motedis_i5, s_profile_2040_openbuilds, s_profile_2060_misumi_hfs5,
  s_profile_2060_openbuilds, s_profile_2080_misumi_hfs5, s_profile_2080_openbuilds, s_profile_3030_bosch,
  s_profile_3030_generic, s_profile_3030_item_6, s_profile_3030_item_6l, s_profile_3030_misumi_hfs6, s_profile_3030_motedis_i6,
  s_profile_3060_bosch, s_profile_3060_item_6, s_profile_3060_item_6l, s_profile_3060_misumi_hfs6, s_profile_4040_bosch_l,
  s_profile_4040_generic, s_profile_4040_item_8, s_profile_4040_item_8l, s_profile_4040_misumi_hfs8, s_profile_4040_motedis_b10,
  s_profile_4040_motedis_i8, s_profile_4080_bosch_l, s_profile_4080_item_8, s_profile_4080_item_8l, s_profile_4080_misumi_hfs8,
  s_profile_4080_motedis_i8, s_profile_4080_openbuilds_cbeam, s_profile_4545_bosch_l, s_profile_4545_misumi_hfs8,
  s_profile_4590_misumi_hfs8, s_profile_angle_al_25x25x3, s_profile_angle_steel_30x30x3, s_profile_angle,
  s_profile_bar_al_25x5, s_profile_bar_steel_30x5, s_profile_bar, s_profile_channel_al_30x20x2, s_profile_channel,
  s_profile_custom, s_profile_round_bar_al_10, s_profile_round_bar_steel_10, s_profile_round_bar, s_profile_round_tube_al_25x2,
  s_profile_round_tube_steel_25x2, s_profile_round_tube, s_profile_tube_al_20x20x2, s_profile_tube_al_25x25x2,
  s_profile_tube_al_40x20x2, s_profile_tube_steel_25x25x2, s_profile_tube_steel_40x40x2, s_profile_tube,
  s_s275, s_slot_10_bosch_45l, s_slot_10_bosch, s_slot_10_misumi_45, s_slot_10_misumi, s_slot_10_motedis,
  s_slot_10, s_slot_3_makerbeam_xl, s_slot_3_makerbeam, s_slot_3_openbeam, s_slot_5_item, s_slot_5_motedis,
  s_slot_6_8020, s_slot_6_bosch, s_slot_6_item_light, s_slot_6_item, s_slot_6_misumi, s_slot_6_motedis_i,
  s_slot_6_motedis, s_slot_6_openbuilds, s_slot_6, s_slot_8_8020, s_slot_8_bosch, s_slot_8_i, s_slot_8_item_light,
  s_slot_8_item, s_slot_8_misumi, s_slot_8_motedis_i, s_slot_8, s_slot_nut_6_bosch_m3_roll_in, s_slot_nut_6_bosch_m4_drop_in,
  s_slot_nut_6_bosch_m4_roll_in, s_slot_nut_6_bosch_m4_slide_in, s_slot_nut_6_bosch_m5_roll_in, s_slot_nut_6_bosch_m5_slide_in,
  s_slot_nut_6_misumi_m3_drop_in, s_slot_nut_6_misumi_m3_roll_in, s_slot_nut_6_misumi_m3_slide_in, s_slot_nut_6_misumi_m3_square,
  s_slot_nut_6_misumi_m4_drop_in, s_slot_nut_6_misumi_m4_roll_in, s_slot_nut_6_misumi_m4_slide_in, s_slot_nut_6_misumi_m4_square,
  s_slot_nut_6_misumi_m5_roll_in, s_slot_nut_6_misumi_m5_slide_in, s_slot_nut_6_misumi_m5_square, s_slot_nut_6_motedis_m4_hammer,
  s_slot_nut_6_motedis_m5_hammer, s_slot_nut_6_motedis_m5_slide_in, s_slot_nut_6_motedis_m5_square, s_slot_nut_6_openbuilds_m5_drop_in,
  s_slot_nut_8_bosch_m4_drop_in, s_slot_nut_8_bosch_m4_roll_in, s_slot_nut_8_bosch_m4_slide_in, s_slot_nut_8_bosch_m5_drop_in,
  s_slot_nut_8_bosch_m5_roll_in, s_slot_nut_8_bosch_m5_slide_in, s_slot_nut_8_bosch_m6_drop_in, s_slot_nut_8_bosch_m6_roll_in,
  s_slot_nut_8_bosch_m6_slide_in, s_slot_nut_8_bosch_m6_t_bolt, s_slot_nut_8_bosch_m8_roll_in, s_slot_nut_8_bosch_m8_slide_in,
  s_slot_nut_8_i_motedis_m4_hammer, s_slot_nut_8_i_motedis_m4_roll_in, s_slot_nut_8_i_motedis_m5_hammer,
  s_slot_nut_8_i_motedis_m5_roll_in, s_slot_nut_8_i_motedis_m6_hammer, s_slot_nut_8_i_motedis_m6_roll_in,
  s_slot_nut_8_i_motedis_m8_roll_in, s_slot_nut_8_misumi_m3_drop_in, s_slot_nut_8_misumi_m3_roll_in, s_slot_nut_8_misumi_m3_slide_in,
  s_slot_nut_8_misumi_m4_drop_in, s_slot_nut_8_misumi_m4_roll_in, s_slot_nut_8_misumi_m4_slide_in, s_slot_nut_8_misumi_m4_square,
  s_slot_nut_8_misumi_m5_drop_in, s_slot_nut_8_misumi_m5_roll_in, s_slot_nut_8_misumi_m5_slide_in, s_slot_nut_8_misumi_m5_square,
  s_slot_nut_8_misumi_m6_drop_in, s_slot_nut_8_misumi_m6_roll_in, s_slot_nut_8_misumi_m6_slide_in, s_slot_nut_8_misumi_m6_square,
  s_slot_nut_8_motedis_m4_hammer, s_slot_nut_8_motedis_m4_roll_in, s_slot_nut_8_motedis_m5_hammer, s_slot_nut_8_motedis_m5_roll_in,
  s_slot_nut_8_motedis_m6_hammer, s_slot_nut_8_motedis_m6_roll_in, s_slot_nut_8_motedis_m8_roll_in, s_unc_10_24,
  s_unc_1_4_20, s_unc_3_8_16, s_unc_4_40, s_unc_5_16_18, s_unc_6_32, s_unc_8_32, s_unf_10_32
].map((s) => [s.name, s]));
/** The kit's own outlines, by the name of the set each belongs to (rules/outlines/<name>.json). @type {Record<string, { name?: string, source: string, licence: string, loops: number[][][] }>} */
export const OUTLINES = { "profile-custom": o_profile_custom };

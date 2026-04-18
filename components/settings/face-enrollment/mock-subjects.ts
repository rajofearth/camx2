import type { EnrollmentSubject } from "./types";

export const MOCK_ENROLLMENT_SUBJECTS: EnrollmentSubject[] = [
  {
    id: "1",
    uid: "UID_8842-XJ",
    name: "Victor Volkov",
    aliasLine: "AKA: The Butcher, V-Ray",
    threatLevel: "critical",
    confidence: 99.4,
    heightCm: 188,
    weightKg: 92,
    crimeCategories: ["HOMICIDE", "EXTORTION"],
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuB2tEAB_haOipFk_yieQT6-fS4JNrUTupUdaIhPLlf36rNPGyd54wMoI-ItII20f5DUKqAhb7q-juhhcWy3hIaFAAj9sgj8ECwqyluXZDlaRkbni2pDm4Koz_1E3xh4YLv4hEmVI08BLpVopdhnbnN48TKekKm0CLO9151-hfHEZLYsZGVbG5_I3t9m92Awp9z1g81FfEojCgdvUsx7MydbAaA2LQdwnWJBCyI8-6JBHL7keqYPPlu7bpeTHu88f9A6E9TF23kbRVPS",
    imageAlt:
      "dramatic frontal mugshot of a middle-aged man with sharp features and cold expression, clinical studio lighting, dark grey background",
    watchlistCode: "CRITICAL_LEVEL_V",
    aliasesDetail: "BUTCHER, V-RAY, THE AXE",
    lastSeen: "ZONE_B4 / 14:22:11",
  },
  {
    id: "2",
    uid: "UID_2109-LP",
    name: "Elena Moretti",
    aliasLine: "AKA: Nightingale",
    threatLevel: "high",
    confidence: 88.2,
    heightCm: 165,
    weightKg: 54,
    crimeCategories: ["ESPIONAGE", "FRAUD"],
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAjc8fD6HxxCzw4RoO6UDQB3SUVYY4YKjWCUYJb-O3XUcEUgkEMbBiQEZmQa8ceGV6Xyj3j1LJ5EN2MqBlbbJYx70XiuTA8EZCrmDKIR3UOK9Sv1XpzHqE7L3qVbHN10L2y2-o7eNiSuBJvJYCWGTIic-oNLfClsJP5t4ZyR1W9GDpymPzxYFECMFatjtMvBJ6I_BWLV9hzcvYnAJk2DwFtP6FEFB3yssZ507RMJsRriW2MJd3IlIeodFaNtk0EQo5WodsibRWfOYOF",
    imageAlt:
      "stern female frontal portrait with neutral expression, clinical lighting for facial recognition, dark moody background, high contrast",
    watchlistCode: "HIGH_LEVEL_II",
    aliasesDetail: "NIGHTINGALE",
    lastSeen: "ZONE_A1 / 09:01:44",
  },
  {
    id: "3",
    uid: "UID_4451-KZ",
    name: "Chen Wei",
    aliasLine: "AKA: Sparks",
    threatLevel: "medium",
    confidence: 91.0,
    heightCm: 178,
    weightKg: 70,
    crimeCategories: ["CYBER_CRIME"],
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuBhZds2ZRStVy325o9IT1Mt2RhXYxMsBaWb1Rei9iz2Ae9ypUfjCxFNod4rVNTDHTwh8fFpEPD7zdVXj2xy8NKMVPoD2umhL7HkJ93F6s-9ddqdSJUf48eU2u2XUZj430iD_YvyhP6GhgBgVhVIjWl1JdN17EiCJlgINjU9UaL1fxVm1B1mWqwgXp3v4bRZX_KYQdYSKTrgxsTZZiQSyktwC0OMxs6_mTJ3ngH2VUgeBaz0TcP0YFEkA2_F0R5FXwKC7Vdk9CE45XMx",
    imageAlt:
      "front profile portrait of a young man with a slight scar, sharp features, dramatic rim lighting on dark background",
    watchlistCode: "MEDIUM_LEVEL_III",
    aliasesDetail: "SPARKS",
    lastSeen: "ZONE_C2 / 11:55:02",
  },
  {
    id: "4",
    uid: "UID_0029-MM",
    name: "Arthur Vance",
    aliasLine: "AKA: Grey Fox",
    threatLevel: "low",
    confidence: 72.4,
    heightCm: 182,
    weightKg: 85,
    crimeCategories: ["SURVEILLANCE"],
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuCKD_AFLjKN5u73MjlJ6lFo0n8SwtrdxCAl9l5p0mPvBNyxap5a7gRLzUaUGjVLOWxhCmh21j2ky14DgVLUrHkGce8pFYXYOarHCDq1QykKO3lm9F_aR3M3JAM0zryVCe6YkpyejQh9y-I897BE3CKQhWWCnLH8f61lJC9_Ku-Z82-4nOtzL_5bN2pyXy1WplGyYl4PqmLY9SR0xGIjb0SA4gi5wPVPnSKmJgbL0vteJYZV8SZIHVS_a0nN3CljVvVYrePr3Z_pbGFX",
    imageAlt:
      "rugged older man with grey beard, frontal view for facial registry, harsh cinematic lighting, monochrome aesthetic",
    watchlistCode: "LOW_LEVEL_IV",
    aliasesDetail: "GREY FOX",
    lastSeen: "ZONE_D9 / 07:18:33",
  },
  {
    id: "5",
    uid: "UID_3391-DF",
    name: "Zara Kova",
    aliasLine: "AKA: The Ghost",
    threatLevel: "critical",
    confidence: 98.1,
    heightCm: 170,
    weightKg: 62,
    crimeCategories: ["NARCOTICS", "ASSAULT"],
    imageUrl:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAn04dcu5G_ynF2-2GyDh6zkKhnQ6DZNv6_EdgcHjgBJ9QxvnZrkuX8FEv8t7L77P700KL8M-5Dr6DKvyz21ypiH3_lQh7tHUNZbHZiZNzCqwNRzNQnUWalZDP80gzfdSB9KrI6Lc278zHiRy7i7MW0iIFmUzQzKqEnkJgob5DVqJvLybt1AIZhpIlWIRdEIO4bZzS4etrj7ksI2-S0X8aiXzmmR01aaBURC7-0nUl9B-1d3KjWnGzrrfywmrMLQLKBfZDX24fuJX-q",
    imageAlt:
      "unemotional female frontal portrait, clinical lighting for identity verification, dark industrial background, sharp focus",
    watchlistCode: "CRITICAL_LEVEL_V",
    aliasesDetail: "THE GHOST, Z-K",
    lastSeen: "ZONE_E3 / 16:40:19",
  },
];

export const TOTAL_REGISTRY_ENTRIES = 12_842;

/** Seed rows bundled with the UI (used for total count offset) */
export const MOCK_SUBJECT_COUNT = MOCK_ENROLLMENT_SUBJECTS.length;

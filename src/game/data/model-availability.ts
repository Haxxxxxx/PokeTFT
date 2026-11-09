// Missing regular GLBs in the upstream asset tree, plus Ekans (23), whose straight mesh is not usable in-game.
const UNAVAILABLE_3D_DEX = new Set([
  23, 521, 668, 850, 851, 852, 853, 854, 859, 860, 861, 863, 864, 866, 868,
  873, 878, 879, 882, 883, 916, 918, 919, 931, 935, 936, 938, 939, 940, 944,
  950, 951, 952, 953, 954, 955, 956, 961, 963, 964, 968, 969, 970, 971, 972,
  976, 977, 986, 988, 989, 991, 992, 993, 1011, 1012, 1013, 1022, 1024,
]);

export const USABLE_3D_MODEL_COUNT = 1025 - UNAVAILABLE_3D_DEX.size;

export function hasUsable3DModel(dex: number): boolean {
  return !UNAVAILABLE_3D_DEX.has(dex);
}

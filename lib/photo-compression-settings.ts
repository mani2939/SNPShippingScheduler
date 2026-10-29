export const photoTargetBytes = 200 * 1024;
export const maxSourceBytes = 25 * 1024 * 1024;
export type CompressionResult = { bytes: ArrayBuffer; type: string; name: string; originalBytes: number; width: number; height: number };
export function imageSize(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

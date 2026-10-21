declare module "omggif" {
  interface GifWriterOptions {
    palette?: number[];
    loop?: number;
  }
  interface AddFrameOptions {
    delay?: number;
    disposal?: number;
    palette?: number[];
    transparent?: number;
  }
  export class GifWriter {
    constructor(
      buf: number[] | Uint8Array,
      width: number,
      height: number,
      opts?: GifWriterOptions
    );
    addFrame(
      x: number,
      y: number,
      w: number,
      h: number,
      indexed: ArrayLike<number>,
      opts?: AddFrameOptions
    ): number;
    end(): number;
  }
}

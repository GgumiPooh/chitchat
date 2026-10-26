export namespace qrcodegen {
  export class QrCode {
    static encodeText(text: string, ecl: QrCode.Ecc): QrCode;
    readonly size: number;
    getModule(x: number, y: number): boolean;
  }
  export namespace QrCode {
    export class Ecc {
      static readonly LOW: Ecc;
      static readonly MEDIUM: Ecc;
      static readonly QUARTILE: Ecc;
      static readonly HIGH: Ecc;
    }
  }
}

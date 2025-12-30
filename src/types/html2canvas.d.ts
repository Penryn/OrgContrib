declare module "html2canvas" {
  type Options = Record<string, unknown>;
  export default function html2canvas(element: HTMLElement, options?: Options): Promise<HTMLCanvasElement>;
}

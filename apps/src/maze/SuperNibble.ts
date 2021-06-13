import { LedMatrixInstance } from "rpi-led-matrix";
import { Maze } from "./Maze";
import { Point2D } from "./Point2D";
import { rgbToHex } from "../utils/rendering";

export class SuperNibble {
  constructor(public position = Point2D.zero) {}

  update() {}

  render(matrix: LedMatrixInstance) {
    const color = rgbToHex(0, 255, 0);
    matrix.fgColor(color).setPixel(this.position.x, this.position.y);
  }
}

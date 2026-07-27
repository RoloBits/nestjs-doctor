import { readFile } from "node:fs/promises";
import { Injectable } from "@nestjs/common";

@Injectable()
export class InvoicesService {
  loadTemplate(name: string): Promise<string> {
    return readFile(`./templates/${name}.html`, "utf-8");
  }

  async sendReceiptEmail(payload: unknown): Promise<void> {
    await Promise.resolve(payload);
  }
}

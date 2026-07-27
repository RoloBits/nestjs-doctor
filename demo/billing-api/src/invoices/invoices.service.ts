import { readFileSync } from "node:fs";
import { Injectable } from "@nestjs/common";

@Injectable()
export class InvoicesService {
  loadTemplate(name: string): string {
    return readFileSync(`./templates/${name}.html`, "utf-8");
  }

  async sendReceiptEmail(payload: unknown): Promise<void> {
    await Promise.resolve(payload);
  }
}

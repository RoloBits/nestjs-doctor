import { Controller, Get } from "@nestjs/common";
import { NotesService } from "./notes.service";

@Controller("notes")
export class NotesController {
	constructor(private readonly notes: NotesService) {}

	@Get()
	list(): boolean {
		return this.notes.direct();
	}
}

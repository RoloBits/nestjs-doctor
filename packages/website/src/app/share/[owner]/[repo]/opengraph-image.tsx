import { notFound } from "next/navigation";
import { certificateFromEntry } from "../../certificate";
import {
	CERTIFICATE_IMAGE_SIZE,
	certificateImage,
} from "../../certificate-image";
import { type EntryParams, entryParams, findEntry } from "./entry";

export const dynamic = "force-static";
export const alt = "Certificate of health, issued by nestjs-doctor";
export const size = CERTIFICATE_IMAGE_SIZE;
export const contentType = "image/png";

export const generateStaticParams = (): EntryParams[] => entryParams();

export default async function Image({
	params,
}: {
	params: Promise<EntryParams>;
}) {
	const entry = findEntry(await params);
	if (!entry) {
		notFound();
	}
	return certificateImage(certificateFromEntry(entry));
}

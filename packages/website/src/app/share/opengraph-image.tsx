import { CERTIFICATE_IMAGE_SIZE, certificateImage } from "./certificate-image";

export const dynamic = "force-static";
export const alt = "Certificate of health, issued by nestjs-doctor";
export const size = CERTIFICATE_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
	return certificateImage(null);
}

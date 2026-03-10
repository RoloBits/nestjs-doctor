import { SoftwareApplicationJsonLd } from "@/components/json-ld";
import Terminal from "@/components/terminal";

const Home = () => (
	<>
		<h1 className="sr-only">
			NestJS Doctor - Diagnose and Fix Your NestJS Code
		</h1>
		<SoftwareApplicationJsonLd />
		<Terminal />
	</>
);

export default Home;

interface Provider {
	module?: string;
}

interface WiringDep {
	className: string;
	dependencies?: WiringDep[];
	methodName: string | null;
	type: string;
}

interface Endpoint {
	controllerClass: string;
}

const WIRING_TYPES: Record<string, number> = {
	service: 1,
	repository: 1,
	guard: 1,
	interceptor: 1,
	pipe: 1,
	filter: 1,
	gateway: 1,
};

// The providers registered by one module.
export function providersOf<P extends Provider>(
	providers: P[],
	moduleName: string
): P[] {
	return providers.filter((p) => p.module === moduleName);
}

// Collapses statement nodes so only injected collaborators are left, and
// drops a class method already listed at this level.
export function wiringChildren(deps: WiringDep[] | undefined): WiringDep[] {
	const seen: Record<string, boolean> = {};
	const out: WiringDep[] = [];
	for (const d of deps || []) {
		if (WIRING_TYPES[d.type]) {
			const key = `${d.className}.${d.methodName}`;
			if (seen[key]) {
				continue;
			}
			seen[key] = true;
			out.push(d);
			continue;
		}
		for (const inner of wiringChildren(d.dependencies)) {
			const k = `${inner.className}.${inner.methodName}`;
			if (seen[k]) {
				continue;
			}
			seen[k] = true;
			out.push(inner);
		}
	}
	return out;
}

// The endpoints handled by one controller class.
export function endpointsOf<E extends Endpoint>(
	endpoints: { endpoints?: E[] } | undefined,
	controllerClass: string
): E[] {
	const list = endpoints?.endpoints || [];
	return list.filter((e) => e.controllerClass === controllerClass);
}

export function Audited() {
	return (_target: unknown, key: string) => {
		store.Delete(key);
	};
}

const store = {
	Delete(key: string) {
		return key;
	},
};

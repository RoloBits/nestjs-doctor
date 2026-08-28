import { type RefObject, useLayoutEffect, useRef } from "react";

// The latest-value ref pattern without mutating a ref during render: the
// value lands in the ref inside the commit, before any external caller
// can read it.
export function useLatest<T>(value: T): RefObject<T> {
	const ref = useRef(value);
	useLayoutEffect(() => {
		ref.current = value;
	});
	return ref;
}

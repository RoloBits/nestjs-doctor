.PHONY: test web check

test:
	pnpm test

web:
	pnpm --filter website dev

check:
	pnpm check
	pnpm test
	pnpm build

.PHONY: test web check graph

test:
	pnpm test

web:
	pnpm --filter website dev

check:
	pnpm check
	pnpm test
	pnpm build

graph:
	pnpm --filter nestjs-doctor build && node packages/nestjs-doctor/dist/cli/index.mjs $(or $(PROJECT),.) --graph

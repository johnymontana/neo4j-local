.PHONY: install build dev lint test test-unit test-integration test-e2e test-coverage clean distclean

# Install dependencies
install: node_modules

node_modules: package.json package-lock.json
	npm ci
	@touch node_modules

# Build ESM + CJS + CLI
build: node_modules
	npm run build

# Watch mode for development
dev: node_modules
	npm run dev

# Type check
lint: node_modules
	npm run lint

# Run all tests
test: node_modules
	npm test

# Unit tests only (fast, no network)
test-unit: node_modules
	npm run test:unit

# CLI integration tests (builds first)
test-integration: build
	npm run test:integration

# End-to-end lifecycle tests (downloads real binaries, slow)
test-e2e: build
	npm run test:e2e

# Unit tests with v8 coverage
test-coverage: node_modules
	npm run test:coverage

# Remove build output
clean:
	rm -rf dist

# Remove build output and dependencies
distclean: clean
	rm -rf node_modules

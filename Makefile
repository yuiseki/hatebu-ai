
all: fetch histogram ai amazon

.PHONY: fetch
fetch:
	npm run fetch

.PHONY: histogram
histogram:
	npm run histogram

.PHONY: ai
ai:
	npm run ai

.PHONY: amazon
amazon:
	npm run amazon

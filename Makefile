
all: fetch histogram ai amazon interests discovery

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

.PHONY: interests
interests:
	npm run interests

.PHONY: discovery
discovery:
	npm run discovery

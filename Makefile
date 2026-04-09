PREFIX   ?= $(HOME)/.local
BINDIR    = $(PREFIX)/bin
AGENTDIR  = $(HOME)/Library/LaunchAgents
PLIST     = com.noswoop.agent.plist

CC       ?= clang
CFLAGS   ?= -Wall -Wextra -O2
LDFLAGS   = -framework CoreGraphics -framework CoreFoundation -framework ApplicationServices -framework AppKit -F/System/Library/PrivateFrameworks -weak_framework SkyLight

SRC       = noswoop.m
BIN       = noswoop

VERSION  ?= $(shell git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')
REPO      = tahul/noswoop

.PHONY: build install uninstall clean release

build: $(BIN)

$(BIN): $(SRC)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

install: build
	@mkdir -p $(BINDIR)
	cp $(BIN) $(BINDIR)/$(BIN)
	@chmod +x $(BINDIR)/$(BIN)
	@echo "Installed $(BINDIR)/$(BIN)"
	@mkdir -p $(AGENTDIR)
	@sed 's|__BINPATH__|$(BINDIR)/$(BIN)|g' $(PLIST) > $(AGENTDIR)/$(PLIST)
	@echo "Installed $(AGENTDIR)/$(PLIST)"
	launchctl bootout gui/$$(id -u) $(AGENTDIR)/$(PLIST) 2>/dev/null || true
	launchctl bootstrap gui/$$(id -u) $(AGENTDIR)/$(PLIST)
	@echo "LaunchAgent loaded. Run 'launchctl kickstart gui/$$(id -u)/com.noswoop.agent' to run now."

uninstall:
	launchctl bootout gui/$$(id -u)/com.noswoop.agent 2>/dev/null || true
	rm -f $(AGENTDIR)/$(PLIST)
	rm -f $(BINDIR)/$(BIN)
	@echo "Uninstalled noswoop"

clean:
	rm -f $(BIN)

# Usage: make release V=0.4.0
# Requires: gh (GitHub CLI)
#
# Steps:
#   1. Update formula URL to new version (sha256 placeholder)
#   2. Commit + push — this is the release commit
#   3. Tag + create GitHub Release from that commit
#   4. Compute SHA from the frozen tarball
#   5. Update formula SHA, amend the commit, force-push + move tag
release:
ifndef V
	$(error Usage: make release V=x.y.z)
endif
	@bash -c '\
	set -e; \
	echo "==> Updating formula URL to v$(V)..."; \
	sed -i "" "s|archive/refs/tags/v.*\.tar\.gz|archive/refs/tags/v$(V).tar.gz|" Formula/noswoop.rb; \
	sed -i "" "s|sha256 \".*\"|sha256 \"\"|" Formula/noswoop.rb; \
	git add Formula/noswoop.rb; \
	git commit -m "release: v$(V)" --allow-empty; \
	git push origin main; \
	\
	echo "==> Creating tag + GitHub Release..."; \
	git tag -f v$(V); \
	git push origin --tags --force; \
	gh release create v$(V) --title "v$(V)" --generate-notes 2>/dev/null || true; \
	\
	echo "==> Computing SHA from frozen tarball..."; \
	sleep 2; \
	SHA=$$(curl -sL https://github.com/$(REPO)/archive/refs/tags/v$(V).tar.gz | shasum -a 256 | cut -d" " -f1); \
	echo "    SHA: $$SHA"; \
	\
	echo "==> Updating formula with SHA..."; \
	sed -i "" "s|sha256 \".*\"|sha256 \"$$SHA\"|" Formula/noswoop.rb; \
	git add Formula/noswoop.rb; \
	git commit --amend --no-edit; \
	git tag -f v$(V); \
	git push origin main --tags --force; \
	\
	echo "==> Verifying..."; \
	sleep 2; \
	VERIFY=$$(curl -sL https://github.com/$(REPO)/archive/refs/tags/v$(V).tar.gz | shasum -a 256 | cut -d" " -f1); \
	if [ "$$SHA" = "$$VERIFY" ]; then \
		echo "==> Released v$(V) ✓"; \
	else \
		echo "==> WARNING: SHA changed ($$SHA -> $$VERIFY). Run make release V=$(V) again."; \
	fi; \
	echo ""; \
	echo "To upgrade: make tap-refresh && brew upgrade noswoop && brew services restart noswoop"; \
	'

tap-refresh:
	cd $$(brew --repo tahul/noswoop) && git pull origin main

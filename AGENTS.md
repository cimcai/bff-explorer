# Deployment Notes For Agents

This repo is the BFF Explorer app served at `https://dangirsh.org/bff/`.
The live deployment is managed by the private tsurf overlay, not by this repo
directly.

## Local Checks

Before redeploying app changes, run:

```sh
npm test
npm run build
```

For browser-level verification, use:

```sh
BFF_EXPLORER_URL=https://dangirsh.org/bff/ npm run test:browser
```

## Redeploy To neurosys-services

1. Commit and push this repo on `main`.

2. Update the private-tsurf flake lock to the pushed BFF commit:

```sh
cd /Users/dan.girshovich/private-tsurf
git pull --ff-only
nix flake lock --update-input bff-explorer
nix run .#check-private
git add flake.lock
git commit -m "Update BFF explorer input"
git push origin main
```

3. Deploy through the private overlay wrapper:

```sh
cd /Users/dan.girshovich/private-tsurf
./scripts/deploy.sh --node neurosys-services
```

Do not deploy this app with direct `nixos-rebuild`, and do not deploy directly
from the public `tsurf` repo. The canonical deploy path is the private overlay
wrapper above.

## Post-Deploy Verification

After deploy, verify:

```sh
curl -k -L -sS -o /dev/null -w '%{http_code} %{url_effective}\n' https://dangirsh.org/bff
BFF_EXPLORER_URL=https://dangirsh.org/bff/ npm run test:browser
ssh root@161.97.74.121 'cat /var/lib/deploy-status/status.json; git -c safe.directory=/data/projects/cimc_alife_hackathon -C /data/projects/cimc_alife_hackathon log -1 --oneline'
```

The tracked checkout on `neurosys-services` lives at
`/data/projects/cimc_alife_hackathon`. Private-tsurf is configured to
fast-forward that checkout during activation for this repo.

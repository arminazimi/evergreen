# Evergreen Backstage sample

Zero-dependency demo of the lifecycle-risk cards. From the Evergreen repository root (after `npm ci`, so Ajv is available for schema checks):

```bash
node integrations/backstage/sample-app/verify.mjs
node integrations/backstage/sample-app/serve.mjs
```

Then open http://127.0.0.1:4173/. Details and full Backstage install steps: [../README.md](../README.md).

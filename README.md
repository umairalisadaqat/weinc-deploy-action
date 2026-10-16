# WeInc Deploy

Publish your built site to [WeInc](https://we.inc) from GitHub Actions and get the live URL back.

The action takes the folder your build produces (for example `dist/`), uploads it to a WeInc project, and outputs the live address. It can also create the project for you first.

No dependencies, nothing to install. Runs on Node 20.

## Usage

```yaml
name: Deploy to WeInc
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build

      - name: Publish to WeInc
        id: weinc
        uses: umairalisadaqat/weinc-deploy-action@v1
        with:
          api-key: ${{ secrets.WEINC_API_KEY }}
          project-id: ${{ vars.WEINC_PROJECT_ID }}
          dist-dir: dist

      - run: echo "Live at ${{ steps.weinc.outputs.site-url }}"
```

### Create a new project, then publish

```yaml
      - uses: umairalisadaqat/weinc-deploy-action@v1
        with:
          api-key: ${{ secrets.WEINC_API_KEY }}
          client-email: client@example.com   # an activated client in your WeInc organization
          name: Acme Landing Page
          dist-dir: dist
```

## Setting up the secret

1. Sign in at [my.we.inc](https://my.we.inc) and open **Integrations -> API keys** (agency dashboard, API section).
2. Create a key with **write** permission. It starts with `wk_`.
3. In your GitHub repo: **Settings -> Secrets and variables -> Actions -> New repository secret**, name it `WEINC_API_KEY`.

The key is masked in logs.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | yes | | WeInc API key (`wk_...`). |
| `project-id` | no | | Existing project to publish to. If empty, a project is created. |
| `client-email` | when creating | | Email of an activated client in your organization; the project is created for them. |
| `name` | when creating | | Project name. |
| `description` | no | | Project description (new projects only). |
| `dist-dir` | no | `dist` | Built site folder. Must contain `index.html` at its root. |
| `publish` | no | `true` | `false` creates/looks up the project without publishing. |
| `api-url` | no | `https://my.we.inc/api/v1` | API base URL. |

## Outputs

| Output | Description |
|---|---|
| `project-id` | Project ID used or created. |
| `site-url` | Live URL of the site. |
| `builder-url` | Link to edit the project in the WeInc builder. |
| `status` | `ready`, `pending` (still going live, e.g. DNS) or `skipped`. |

## Good to know

- **Publishing counts toward your plan's monthly publish limit.** It does not spend AI credits. If the limit is reached the step fails with WeInc's message.
- The action publishes files you have already built. It does not generate a site from a prompt; do that in the [WeInc builder](https://my.we.inc).
- Keep uploads small: the whole site is sent in one request, so very large media is better hosted elsewhere.
- Binary files (images, fonts, video, PDF) are sent base64-encoded; everything else as text.

## API endpoints used

- `POST /api/v1/projects` (only when `project-id` is empty)
- `POST /api/v1/projects/{id}/publish`
- `GET /api/v1/projects/{id}/preview`

Full API reference: [my.we.inc/api/v1/docs](https://my.we.inc/api/v1/docs).

## License

MIT

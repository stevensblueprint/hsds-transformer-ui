<picture>
  <source
    media="(prefers-color-scheme: dark)"
    srcset="https://sitblueprint.com/assets/logos/logo_banner_negative.webp"
  />
  <img
    alt="Blueprint"
    src="https://sitblueprint.com/assets/logos/logo_banner.webp"
  />
</picture>

# HSDS Transformer UI

The user interface for the HSDS Transformer allows you to upload a zip file containing your input and mapping files, run the transformation, and get back a zip file containing your transformed JSON files.

How to set up the repository locally:

Clone the repository.  
Install Node.js.  
Run `npm ci` to install all the packages in the package.json.  
To run the development server for the UI: `npm run dev`.  

## Scripts

Available `package.json` scripts:

- `npm run dev`: Start the Vite dev server with HMR.
- `npm run build`: Type-check with TypeScript project references and build for production.
- `npm run lint`: Run ESLint across the codebase.
- `npm run format:check`: Check formatting with Prettier without writing changes.
- `npm run format:fix`: Format files with Prettier and write changes.
- `npm run preview`: Preview the production build locally.


## Deployment
**Still to-do**
- [ ] **GitHub Secrets**: Configure your secrets in your GitHub repository:
  - All `VITE_*` environment variables required by your application.
  - Update them in `.github/workflows/deploy.yml` so they are also built into the deployed site

```yaml
- name: Build site
  env:
    VITE_AWS_REGION: ${{ secrets.VITE_AWS_REGION }}
    ...
    VITE_APP_URL: ${{ secrets.VITE_APP_URL }}
    VITE_YOUR_ENV_VARIABLE: ${{ secrets.YOUR_ENV_VARIABLE }}
```

## GitHub Workflows

This template includes two GitHub Actions workflows:

- **Build (`build.yml`)**: Triggered on every push and pull request to the `main` branch. It ensures the code is clean and buildable by running:
  - Dependency installation (`npm ci`)
  - Linting (`npm run lint`)
  - Formatting checks (`npm run format:check`)
  - Production build (`npm run build`)

- **Deploy (`deploy.yml`)**: Triggered on every push to the `main` branch. It automates the deployment to AWS by:
  - Building the production application with the necessary environment variables.
  - Authenticating with AWS using OIDC.
  - Synchronizing the build output (`dist/`) to an S3 bucket.
  - Invalidating the CloudFront distribution to ensure the latest version is served.

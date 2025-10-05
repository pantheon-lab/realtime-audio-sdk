# GitHub Workflows

This directory contains automated workflows for the Realtime Audio SDK project.

## Workflows

### 1. Test (`test.yml`)
- **Trigger**: Push to `main` branch or pull requests targeting `main`
- **Purpose**: Run automated tests, type checking, linting, and build verification
- **Matrix**: Tests against Node.js 18.x and 20.x
- **Actions**:
  - Type checking
  - Linting
  - Unit tests
  - Coverage reporting
  - Build verification

### 2. Publish Package (`publish.yml`)
- **Trigger**: Push of version tags (e.g., `v1.0.0`, `v2.1.0`)
- **Purpose**: Automatically publish package to GitHub Packages
- **Actions**:
  - Run tests
  - Build package
  - Publish to GitHub Packages
  - Create GitHub Release

## Setup Instructions

No additional setup required! GitHub Actions automatically has permission to publish to GitHub Packages in the same repository.

## Usage

### Creating a Release
1. Update version in `package.json`
2. Commit changes: `git commit -am "chore: bump version to x.y.z"`
3. Create and push a tag:
   ```bash
   git tag vx.y.z
   git push origin vx.y.z
   ```
4. The package will automatically be published to GitHub Packages and a GitHub Release will be created

## Installing from GitHub Packages

To install the package from GitHub Packages:

1. Create a `.npmrc` file in your project:
   ```
   @realtime-ai:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

2. Set your GitHub token:
   ```bash
   export GITHUB_TOKEN=your_github_personal_access_token
   ```

3. Install the package:
   ```bash
   npm install @realtime-ai/audio-sdk
   ```

## Badges

Add these badges to your README.md:

```markdown
![Tests](https://github.com/realtime-ai/realtime-audio-sdk/workflows/Test/badge.svg)
![Package](https://github.com/realtime-ai/realtime-audio-sdk/workflows/Publish%20Package/badge.svg)
```
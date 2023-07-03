# Patch-review

This action creates a pull request based on changes in a set of patch (diff) files in a repository. It allows for easier review of changes being proposed in a pull request containing patch files.

# Usage
```yaml
- uses: kodebooth/patch-review
  with:
    # URI of the upstream project
    upstream-uri: ''

    # Token to access upstream project, or omit if not necessary
    upstream-token: ''

    # Glob for local patch files
    patches: 'patches/*.patch'

    # Token to access local project, default to ${{ github.token }}
    token:

    # Indicates whether to follow symbolic links when looking up patches
    follow-symbolic-links: true

    # Name of the working directory, defaults to wrkdir
    wrkdir: 'wrkdir'
```

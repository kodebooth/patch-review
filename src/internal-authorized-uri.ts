import * as Uri from 'uri-js'
import * as core from '@actions/core'

export class AuthorizedUri {
  uri: string
  token: string | undefined
  username: string | undefined
  password: string | undefined

  constructor(uri: string) {
    this.uri = uri
  }

  private authorize_with_userinfo(userinfo: string): void {
    const parsedUri = Uri.parse(this.uri)

    parsedUri.userinfo = userinfo

    this.uri = Uri.serialize(parsedUri)
  }

  authorize_with_token(token: string): void {
    this.token = token
    this.authorize_with_userinfo(token)
  }

  authorize_with_username(username: string): void {
    this.username = username
    this.authorize_with_userinfo(username)
  }

  authorize_with_username_password(username: string, password: string): void {
    this.username = username
    this.password = password
    this.authorize_with_userinfo(`${username}:${password}`)
  }
}

export class AuthorizedUriFactory {
  private static create_with_token(uri: string, token: string): AuthorizedUri {
    core.debug(`Create AuthorizeUri for ${uri} with token: ${token}`)

    const authorizedUri = new AuthorizedUri(uri)
    authorizedUri.authorize_with_token(token)
    return authorizedUri
  }

  private static create_with_username(
    uri: string,
    username: string
  ): AuthorizedUri {
    core.debug(`Create AuthorizeUri for ${uri} with username: ${username}`)

    const authorizedUri = new AuthorizedUri(uri)
    authorizedUri.authorize_with_username(username)
    return authorizedUri
  }

  private static create_with_username_password(
    uri: string,
    username: string,
    password: string
  ): AuthorizedUri {
    core.debug(
      `Create AuthorizeUri for ${uri} with username: ${username}, password: ${password}`
    )

    const authorizedUri = new AuthorizedUri(uri)
    authorizedUri.authorize_with_username_password(username, password)
    return authorizedUri
  }

  static create(uri: string, prefix?: string): AuthorizedUri {
    if (typeof prefix === 'undefined') {
      prefix = ''
    }

    const token = core.getInput(`${prefix}token`)
    if (token.length) {
      return this.create_with_token(uri, token)
    }

    const username = core.getInput(`${prefix}username`)
    const password = core.getInput(`${prefix}password`)
    if (!username.length && !password.length) {
      return new AuthorizedUri(uri)
    }
    if (username.length && !password.length) {
      return this.create_with_username(uri, username)
    }
    if (username.length && password.length) {
      return this.create_with_username_password(uri, username, password)
    }

    throw new Error('Cannot specify password without username')
  }
}

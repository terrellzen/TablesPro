CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth."user" (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.session (
  id text PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  token text NOT NULL UNIQUE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  "activeOrganizationId" text
);

CREATE TABLE auth.account (
  id text PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.verification (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.organization (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  metadata text
);

CREATE TABLE auth.member (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES auth.organization(id) ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  "createdAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth.invitation (
  id text PRIMARY KEY,
  "organizationId" text NOT NULL REFERENCES auth.organization(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text,
  status text NOT NULL DEFAULT 'pending',
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "inviterId" text NOT NULL REFERENCES auth."user"(id) ON DELETE CASCADE
);

CREATE INDEX session_user_id_idx ON auth.session("userId");
CREATE INDEX account_user_id_idx ON auth.account("userId");
CREATE INDEX verification_identifier_idx ON auth.verification(identifier);
CREATE INDEX organization_slug_idx ON auth.organization(slug);
CREATE INDEX member_organization_id_idx ON auth.member("organizationId");
CREATE INDEX member_user_id_idx ON auth.member("userId");
CREATE UNIQUE INDEX member_organization_user_idx ON auth.member("organizationId", "userId");
CREATE INDEX invitation_organization_id_idx ON auth.invitation("organizationId");
CREATE INDEX invitation_email_idx ON auth.invitation(email);

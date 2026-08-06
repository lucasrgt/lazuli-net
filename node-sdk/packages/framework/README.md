# @skiesjs/framework

The dependency-only Rails-omakase front door for Skies Node.js. Installing it brings the portable runtime,
Express/OpenAPI/auth/storage adapters, and both removable doctors. It exports no runtime facade and generates no
behavior: applications continue importing the focused packages directly, so removing this meta-package after
installing those dependencies cannot change the application.

Drizzle/PostgreSQL and test helpers remain opt-in satellites and are deliberately not dependencies of this package.
Use the focused packages instead when an application wants an à-la-carte graph.

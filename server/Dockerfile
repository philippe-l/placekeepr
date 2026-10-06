# Node 22 : type stripping natif (--experimental-strip-types), pas d'étape de
# build ni de bundler — les .ts sont exécutés tels quels.
# Image figée par digest (audit 06/10/2026) : un tag bouge sans prévenir.
# Mise à jour : relire le digest de node:22-alpine et le remplacer ici.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
# Les migrations SQL sont lues à l'exécution (src/migrate.ts), pas au build :
# oubliées ici, l'API démarre en refusant de servir un schéma inconnu.
COPY db ./db

ENV NODE_ENV=production
EXPOSE 8787

# Utilisateur non-root : le service détient le keypair du vérifieur.
USER node

CMD ["node", "--experimental-strip-types", "src/index.ts"]

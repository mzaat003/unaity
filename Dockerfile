# Container image for unaity — works on Railway, Fly.io, Google Cloud Run,
# or any Docker host. Provider keys are passed in as environment variables at
# run time (never baked into the image).
FROM node:22-alpine

WORKDIR /app

# Install only production deps first, for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy the rest of the app.
COPY . .

# The app reads PORT from the environment (defaults to 3000) and binds 0.0.0.0.
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]

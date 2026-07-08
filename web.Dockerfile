FROM node:20-alpine

WORKDIR /app

COPY webUI_v2_Full/.output /app

ENV NITRO_PORT=3000
ENV NITRO_HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "server/index.mjs"]

FROM public.ecr.aws/amazonlinux/amazonlinux:2023

RUN dnf install -y nodejs && dnf clean all

WORKDIR /app
COPY package.json server.js ./

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER 1000
CMD ["node", "server.js"]


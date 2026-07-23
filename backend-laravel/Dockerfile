FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json ./
RUN composer install --no-dev --no-interaction --no-scripts --prefer-dist

FROM php:8.3-cli-alpine
RUN apk add --no-cache libpq-dev oniguruma-dev \
    && docker-php-ext-install pdo_pgsql mbstring
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
RUN php artisan package:discover --ansi
EXPOSE 4000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=4000"]

# APK Extractor

Android-приложение для экспорта установленных приложений без root.

## Возможности

- список установленных пользовательских и системных приложений;
- иконка, название, package name, версия, versionCode, размер;
- даты установки и обновления;
- поиск и сортировка;
- Single APK и Split APK;
- экспорт Single APK в `.apk`;
- экспорт Split APK как `.apks` ZIP-контейнер с `base.apk`, всеми split APK и `manifest.json`;
- множественный выбор долгим нажатием;
- массовый экспорт;
- Storage Access Framework для выбора папки;
- Android Sharesheet;
- светлая/тёмная/системная тема.

## Android

- minSdk 26 (Android 8.0)
- targetSdk 36
- compileSdk 36
- Kotlin
- Jetpack Compose + Material 3
- Java 17 / Gradle 8.13

## Сборка

В checkout репозитория wrapper не включён. Установите JDK 17 и Gradle 8.13,
затем выполните из папки apk-extractor:

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
```

Для локального wrapper выполните `gradle wrapper --gradle-version 8.13`,
после этого можно пользоваться `./gradlew`. Архив проекта из Actions уже
содержит сгенерированный wrapper.

CI на pull request в Android-ветку проверяет unit-тесты, Android Lint и сборку.

Результат:

```text
app/build/outputs/apk/debug/app-debug.apk
```

## Package visibility

В sideload-сборке используется:

```xml
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
```

Это требуется основной функции приложения — показать установленный список пакетов. Для публикации в Google Play использование разрешения должно соответствовать актуальной политике Google Play.

## Storage

Приложение не использует `MANAGE_EXTERNAL_STORAGE` и не требует root. Экспорт выполняется через системный Storage Access Framework.

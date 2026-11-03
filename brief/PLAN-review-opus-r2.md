## Summary
Verdict: BLOCK

Это контрольный раунд ревью brief/PLAN.md v2 (e5bcd12) против моего прошлого BLOCK, кода движка и требований R15/R16. Субагентов не запускал, файлы не менял.

- H1, H2, H3 и M1–M5 в v2 закрыты.
- R15 и R16 закреплены за срезами, у каждого есть проверяемый гейт.
- v2 вносит одну новую High-проблему в §2, то есть в контракт, по которому прямо сейчас работает срез A. Вывод Loore положен внутрь корня сборки EdgeLab (`build/loore/`). Текущий deploy.sh отправит его на живой blog.edgelab.space, а сборка EdgeLab его сотрёт.

## Findings / Changes

**Рискованные зоны (проверял первыми):**
- деплой на общий прод Timeweb (`rsync --delete`, Caddy);
- внешние отправки (IndexNow, GSC);
- аналитика (чужой счётчик);
- атрибуция промокода BLOG.

Auth, миграций и секретов в плане нет.

### 1. Delivered: закрыты ли прежние находки
| Находка | Статус | Где в v2, сверка с кодом |
|---|---|---|
| H1 | closed | Шаг 0 описан в PLAN.md:68. Это реально: prerender.mjs:250-275 сейчас удаляет вывод Babel (`_slicedToArray`, длина >4000), значит этот вывод можно сохранить через хук `prepareSnapshot` до удаления. Разбиение данных идёт только после отказа от перемонтирования, либо данные страницы содержат `bodyHtml` (PLAN.md:72; перемонтирование — gf-app.jsx:1874). Гейт сохранения текста статьи измерим (PLAN.md:80). |
| H2 | closed (с оговоркой N3) | Сравнение build EdgeLab по списку файлов и хешам (PLAN.md:58). Сборка детерминирована: `today` в build-seo.mjs:699 используется только как запасное значение. Grep-гейт утечки с FAIL (PLAN.md:60), отказ при отсутствии обязательного ключа (:54), копирование только своих ассетов (:55, против prerender.mjs:186-197). |
| H3 | closed | Таблица владельцев PLAN.md:30-40 и единственные владельцы PLAN.md:46. P владеет шрифтами и аналитикой. Общие точки входа (prerender, build-seo, gf-app.jsx, site/*.html) принадлежат только A, остальные подключаются через хуки (:42). E разбит на 3 джоба по 4 статьи (:166-179). |
| M1 | closed | UTM по slug с первого дня, тест на точный href при конфликтующих входящих UTM (PLAN.md:90-94). Учтено, что `wireUTMForward` (gf-app.jsx:87-116) может переписать ссылку. CTA обещает скидку только на месячные тарифы (:96). |
| M2 | closed | Маршрут через `import`, отдельный `install-caddy-import.py` с тестами на временном `CADDYFILE`. Признано, что swap-caddy-block.py:17-19 падает, если блока нет (PLAN.md:123). |
| M3 | closed | Сначала DNS-only, потом proxied + Full (strict); доступ к зоне через Сильвану (PLAN.md:122, :125). |
| M4 | closed | Бренд и webroot берутся из manifest, `ALLOW_DELETE` не перекрывает несовпадение, негативные тесты (PLAN.md:128-130). Сейчас значение по умолчанию — deploy.sh:21-22. |
| M5 | closed | Счётчик Loore по умолчанию с поддоменами, webvisor выключен (PLAN.md:136). Сейчас стоит `webvisor:true`: build-seo.mjs:433. |
| R15 | covered | Срез C (PLAN.md:100-106): sharp, AVIF/WebP/JPEG, ширины 800/1600, бюджеты в КБ, тесты декодирования и размеров. Бюджеты движка — у P (PLAN.md:76). Гейт проверяемый. |
| R16 | covered, partial до запуска | Срез M (PLAN.md:140-156): фикстурные тесты, `unavailable` вместо нуля. G проверяет первый прогон и дату следующего. Гейт проверяемый; честно помечен partial, пока нет доступов (:156). |

### 2. Design: новые проблемы v2

**N1 (High, влияет на работу A). Вывод Loore `build/loore/` лежит внутри корня деплоя EdgeLab (PLAN.md:52).**
- deploy.sh:38-39 и :74 делают `rsync --delete "$ROOT/build/"` в `/var/www/blog-edgelab-space`. Если собрать Loore после EdgeLab, весь сайт Loore уедет на живой blog.edgelab.space/loore/: дубли, чужие canonical, утечка. Сухой прогон ловит только удаления, а не добавления.
- Обратный порядок тоже ломается: prerender.mjs:428 (`fs.rm(BUILD, {recursive})`) при сборке EdgeLab стирает сборку Loore. Это противоречит требованию «archive outputs independently» в той же строке плана.
- Гейт A (PLAN.md:58, «complete relative file lists» дерева `build/`) захватит `build/loore/`, если он есть, и станет нестабильным.
- Защита через manifest появится только в срезе F, который идёт параллельно после A. До этого деплой EdgeLab с текущим deploy.sh небезопасен.
- Минимальный фикс в §2: outputDir для Loore — соседний каталог вне `build/` (например `build-loore/` и `.build/loore/` как workDir). Плюс приёмка A: сборка EdgeLab не трогает и не содержит выводов других брендов.
- Проверено чтением deploy.sh:38-39, :74 и prerender.mjs:36, :428.

**N2 (Medium). P и C работают параллельно, но verify C зависит от формата данных P.**
- verify-google-seo.mjs:40 и verify-category-pages.mjs:32 читают `build/guides-data.js` целиком. Разбиение данных в P их сломает, а verify-*.mjs принадлежат C.
- verify-readthrough-analytics.mjs (C) проверяет события, которые переписывает P.
- Фикс: в §1 зафиксировать, что verify читает данные из manifest или через экспортированный P формат, и что разбиение данных в P мержится только вместе с правкой verify от C.

**N3 (Medium). Гейт утечки противоречит допуску A.**
- В общем gf-styles.css есть комментарии с «EdgeLab» (gf-styles.css:10, :59, :769), а `/images/author-avatar.png` лежит в gf-app.jsx:181. Для Loore grep (PLAN.md:60) гарантированно даст FAIL.
- Чистка исходников меняет байты сборки EdgeLab. При этом допуск PLAN.md:58 ограничен «manifest + extracted script references/assets».
- Фикс: явно разрешить в списке A удаление комментариев и CSS-литералов, либо вырезать комментарии при сборке только для небрендовых сборок.

**N4 (Medium). Нет гейта выпуска шага 0 на живой EdgeLab.**
- Шаг 0 меняет рантайм EdgeLab (PLAN.md:68), но «separate regression comparison» (:58) не описан. Выпуск EdgeLab не стоит ни в одном срезе: F — только Loore.
- Фикс: в P добавить приёмку EdgeLab на staging (перечисленный diff, сохранение текста, отсутствие ошибок консоли) до деплоя EdgeLab текущим deploy.sh.

### 3. Code
Кода в изменении нет, только документы. Ссылки v2 на код проверены: deploy.sh:21-22, swap-caddy-block.py:17-19, build-seo.mjs:446-451 (OG в WebP), gf-app.jsx:384/:1784/:1874, scroll-depth.js:14. Все совпадают.

### Blocking
- PLAN.md:52 (deploy.sh:74, prerender.mjs:428): вынести outputDir Loore из `build/`. Добавить в приёмку A, что EdgeLab `build/` не содержит чужих выводов, а сборка одного бренда не стирает другой.

### Non-blocking
- PLAN.md:35/:72 (verify-google-seo.mjs:40, verify-category-pages.mjs:32): связать разбиение данных в P с правкой verify в C, мержить вместе.
- PLAN.md:58/:60 (gf-styles.css:10,:59,:769; gf-app.jsx:181): разрешить в допуске A чистку комментариев и литералов либо делать её только для небрендовых сборок.
- PLAN.md:58/:68: описать в P приёмку EdgeLab на staging перед выпуском шага 0 на blog.edgelab.space.

Brief gap (N1): в брифе v2 не было правила «вывод небрендовой сборки не должен лежать внутри корня деплоя бренда по умолчанию». Нужно было сослаться на deploy.sh:74.

## Evidence
- Прочитал brief/PLAN.md, PLAN-review-opus.md, CHECKLIST.md; `git show --stat HEAD` (e5bcd12).
- Прочитал `sed` prerender.mjs:175-290, build-seo.mjs:440-452 и :690-710, swap-caddy-block.py:10-25, deploy.sh:15-30.
- `grep`: в deploy.sh rsync `$ROOT/build/` с `--delete` (:38-39, :74); `fs.rm(BUILD...)` в prerender.mjs:428; `const BUILD = join(ROOT,"build")` в prerender/build-seo/indexnow/verify-*.
- `grep`: `guides-data.js` в verify-category-pages.mjs:32 и verify-google-seo.mjs:40; «edgelab» в gf-styles.css:10, :59, :769; `author-avatar` в gf-app.jsx:181.
- `grep` Date/now в scripts: недетерминированного вывода, кроме запасного `today`, нет.

## Not done / uncertain
- Сборки не запускал. Детерминизм дерева для гейта A выведен из кода, а не проверен двумя сборками.
- Не проверял, обходят ли verify-*.mjs `build/` рекурсивно, то есть сломает ли вложенный `build/loore` и verify EdgeLab.
- Состояние Timeweb, Caddy, DNS и счётчика Loore не проверял (вне scope).
- Low-пункты и стиль не пересматривал, как и требовал бриф.

## Progress
- 19:35 UTC Прочитал план v2, прошлое ревью и чеклист.
- 19:36 UTC Сверил prerender.mjs, build-seo.mjs на детерминизм, package.json.
- 19:36 UTC Сверил deploy.sh, swap-caddy, ссылки на gf-app и scroll-depth; нашёл вложенный build/loore (N1).
- 19:37 UTC Проверил литералы для гейта утечки, verify и guides-data; обновил PROGRESS.md.
- 19:37 UTC Написал отчёт.

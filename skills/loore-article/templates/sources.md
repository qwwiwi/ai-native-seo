# Источники и сверка: <<PLACEHOLDER: slug>>

Статья: `brands/loore/content-guides/<<PLACEHOLDER: slug>>.mdx`
Тема: <<PLACEHOLDER: номер и заголовок из brands/loore/editorial/topics.md>>
Автор записи: <<PLACEHOLDER: агент/джоб и модель>>

## 1. Запрос

| Поле | Значение |
|---|---|
| Целевой запрос | <<PLACEHOLDER>> |
| Спрос | <<PLACEHOLDER: число>> – Wordstat RU, в месяц, по данным Кельтаса, ноябрь 2026, не перепроверено |
| Перепроверка | <<PLACEHOLDER: кто, когда, регион – или «не перепроверено»>> |
| Интент | <<PLACEHOLDER: что человек хочет получить>> |
| Не дублировать | <<PLACEHOLDER: смежные slug из topics.md и чем отличается интент>> |

## 2. Снимок llms-full.txt

| Поле | Значение |
|---|---|
| URL | https://loore.ai/llms-full.txt |
| Получено (UTC) | <<PLACEHOLDER: date -u +%FT%TZ>> |
| Размер, байт | <<PLACEHOLDER>> |
| sha256 | <<PLACEHOLDER>> |

## 3. Утверждения

Одна строка – одно атомарное утверждение из статьи. Вердикт: supported / rephrased / removed.

| # | Утверждение в статье | Источник (URL, раздел, строка) | Цитата источника | Проверено (UTC) | Вердикт |
|---|---|---|---|---|---|
| 1 | <<PLACEHOLDER>> | <<PLACEHOLDER>> | <<PLACEHOLDER>> | <<PLACEHOLDER>> | <<PLACEHOLDER>> |

## 4. Числа

Каждое число из статьи (кроме года в title и номеров шагов).

| Число | Где в статье | Источник | Проверено |
|---|---|---|---|
| <<PLACEHOLDER>> | <<PLACEHOLDER>> | <<PLACEHOLDER>> | <<PLACEHOLDER>> |

## 5. CTA

| Размещение | href (точно) | Формулировка |
|---|---|---|
| article-end | https://loore.ai/r/blog?utm_source=blog&utm_medium=article&utm_campaign=<<PLACEHOLDER: slug>>&utm_content=article-end | Промокод BLOG – скидка на месячные тарифы |

## 6. Обложка

| Поле | Значение |
|---|---|
| Промпт | `brands/loore/assets/covers/<<PLACEHOLDER: slug>>/prompt.md` |
| Модель, дата | gpt-image-2, <<PLACEHOLDER>> |
| Текст в сцене | <<PLACEHOLDER: проверено, нет>> |
| Манифест | <<PLACEHOLDER: путь к манифесту среза C>> |

## 7. Lint

```
<<PLACEHOLDER: команда и вывод content-lint>>
```

## 8. Definition of done

<<PLACEHOLDER: отметки по чеклисту шага 10 из skills/loore-article/SKILL.md>>

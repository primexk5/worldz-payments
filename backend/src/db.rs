use std::{error::Error as StdError, marker::PhantomData};

use ::sqlx::{
    postgres::{PgArguments, PgQueryResult, PgRow},
    Arguments, Error, Executor, Postgres,
};

type BoxDynError = Box<dyn StdError + Send + Sync>;

/// PostgreSQL query facade for positional binds and the small set of legacy SQL forms used here.
pub mod sqlx {
    pub use super::query;
    pub use ::sqlx::query_scalar;
    pub use ::sqlx::{postgres, Error, Row};
}

pub struct Query<'q> {
    sql: String,
    arguments: Result<PgArguments, BoxDynError>,
    _lifetime: PhantomData<&'q str>,
}

pub fn query(sql: &str) -> Query<'_> {
    let mut sql = number_placeholders(sql);
    sql = sql.replace("UTC_TIMESTAMP(6)", "CURRENT_TIMESTAMP");
    sql = sql.replace("UTC_TIMESTAMP()", "CURRENT_TIMESTAMP");
    sql = sql.replace(" AS CHAR)", " AS TEXT)");
    if let Some(rest) = sql.strip_prefix("INSERT IGNORE INTO ") {
        sql = format!("INSERT INTO {rest}");
        if !sql.to_ascii_uppercase().contains(" ON CONFLICT ") {
            sql.push_str(" ON CONFLICT DO NOTHING");
        }
    }
    Query {
        sql,
        arguments: Ok(PgArguments::default()),
        _lifetime: PhantomData,
    }
}

fn number_placeholders(sql: &str) -> String {
    let mut output = String::with_capacity(sql.len() + 16);
    let mut index = 0usize;
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut chars = sql.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '\\' && (in_single_quote || in_double_quote) {
            output.push(ch);
            if let Some(next) = chars.next() {
                output.push(next);
            }
            continue;
        }
        if ch == '\'' && !in_double_quote {
            output.push(ch);
            if in_single_quote && chars.peek() == Some(&'\'') {
                output.push(chars.next().expect("peeked quote"));
            } else {
                in_single_quote = !in_single_quote;
            }
            continue;
        }
        if ch == '"' && !in_single_quote {
            output.push(ch);
            if in_double_quote && chars.peek() == Some(&'"') {
                output.push(chars.next().expect("peeked quote"));
            } else {
                in_double_quote = !in_double_quote;
            }
            continue;
        }
        if ch == '?' && !in_single_quote && !in_double_quote {
            index += 1;
            output.push('$');
            output.push_str(&index.to_string());
        } else {
            output.push(ch);
        }
    }
    output
}

impl<'q> Query<'q> {
    pub fn bind<T>(mut self, value: T) -> Self
    where
        T: ::sqlx::Encode<'q, Postgres> + ::sqlx::Type<Postgres> + 'q,
    {
        self.arguments = match self.arguments {
            Ok(mut arguments) => arguments.add(value).map(|()| arguments),
            Err(error) => Err(error),
        };
        self
    }

    pub async fn execute<'e, E>(self, executor: E) -> Result<PgQueryResult, Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let Self { sql, arguments, .. } = self;
        ::sqlx::__query_with_result::<Postgres, PgArguments>(&sql, arguments)
            .execute(executor)
            .await
    }

    pub async fn fetch_all<'e, E>(self, executor: E) -> Result<Vec<PgRow>, Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let Self { sql, arguments, .. } = self;
        ::sqlx::__query_with_result::<Postgres, PgArguments>(&sql, arguments)
            .fetch_all(executor)
            .await
    }

    pub async fn fetch_one<'e, E>(self, executor: E) -> Result<PgRow, Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let Self { sql, arguments, .. } = self;
        ::sqlx::__query_with_result::<Postgres, PgArguments>(&sql, arguments)
            .fetch_one(executor)
            .await
    }

    pub async fn fetch_optional<'e, E>(self, executor: E) -> Result<Option<PgRow>, Error>
    where
        E: Executor<'e, Database = Postgres>,
    {
        let Self { sql, arguments, .. } = self;
        ::sqlx::__query_with_result::<Postgres, PgArguments>(&sql, arguments)
            .fetch_optional(executor)
            .await
    }
}

#[cfg(test)]
mod tests {
    use super::{number_placeholders, query};

    #[test]
    fn postgres_placeholders_skip_quoted_question_marks() {
        assert_eq!(
            number_placeholders("SELECT ? AS value, '?' AS literal, ? AS next"),
            "SELECT $1 AS value, '?' AS literal, $2 AS next"
        );
    }

    #[test]
    fn supported_mysql_compatibility_forms_are_rewritten() {
        let insert = query("INSERT IGNORE INTO sample (id) VALUES (?)");
        assert_eq!(
            insert.sql,
            "INSERT INTO sample (id) VALUES ($1) ON CONFLICT DO NOTHING"
        );
        let timestamp = query("SELECT UTC_TIMESTAMP(6), CAST(? AS CHAR)");
        assert_eq!(timestamp.sql, "SELECT CURRENT_TIMESTAMP, CAST($1 AS TEXT)");
    }
}

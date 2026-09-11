# Completeness

The behind-check applied to every candidate before sizing. Screens show the surface; this checklist recovers what makes it actually work. For each row, ask the question — a `yes` with no covering slice means add the slice now.

| #   | Area                       | Question                                                                   | Missing slice looks like                                                                                                                |
| --- | -------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Persistence                | Does the result survive reload / navigate away?                            | trigger `ユーザーがフォームを送信する` / result `入力が保存され、完了メッセージが表示される` / route `[submit_handler, record_store]`   |
| 2   | Validation / error         | What rejects bad input, and what does the user see?                        | trigger `ユーザーが不正な値を入力して送信する` / result `エラーメッセージが該当欄に表示される` / route `[validation, error_display]`    |
| 3   | Empty / loading            | What shows before data exists or while it loads?                           | trigger `データ未登録で一覧が開かれる` / result `空状態の説明と新規作成への導線が表示される` / route `[empty_check, empty_guide]`       |
| 4   | Auth / authz gate          | Is any step restricted? What blocks anonymous or unauthorized use?         | trigger `ログインしていない利用者がログインが必要な操作を試みる` / result `ログインへ誘導される` / route `[auth_check, login_redirect]` |
| 5   | Notification / side effect | Must anyone or anything else react (operator mail, webhook, index update)? | trigger `問い合わせが保存される` / result `運用担当者に通知される` / route `[save_event, notification_dispatch]`                        |
| 6   | Transition                 | Where does the user go next (thanks page, redirect, deep link)?            | trigger `送信が完了する` / result `完了画面へ遷移する` / route `[submit_ack, thanks_navigate]`                                          |

## Rules

- Happy-path-only sets are incomplete by default — rows 2 and 3 must be answered (covered or explicitly deferred with a reason) for every user-facing candidate
- Deferred rows are recorded as chat reasons, never silently dropped; the deferral names the future slice that will cover them
- Type-level and library slices answer rows 1–6 as input/output correspondence where runtime wording does not apply (e.g. error-path overloads cover row 2)

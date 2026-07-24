// /api/_crm-users.js — учётные записи команды для CRM.
// Имя с _ → Vercel не считает это endpoint'ом.
// Пароли НЕ хранятся: только salted SHA-256 (salt+password). Плейнтекст — у владельца.
// Чтобы сменить пароль/добавить сотрудника — сгенерировать новый salt+hash и заменить запись.

export const USERS = [
  { login: 'alizhan',  name: 'Алижан',      salt: '657b32a95b7d34f32e8b4bf1', hash: '2d9a1eab929c195b2fe7161b96806248420be76471cf1e765a06c00a89627fec' },
  { login: 'manager1', name: 'Менеджер 1',  salt: '70b0c37cda812945e65eca6b', hash: '018ab1f77f14071b81940c8b204af38072669a951d07e66f3410c880ed562291' },
  { login: 'manager2', name: 'Менеджер 2',  salt: 'cbdacc4d6b3bfaa877d8f8a8', hash: '0182b3b2ad44ad22fbd9e0ef9ca7a159302fe49ea57757051ee7222fbd5988ea' },
];

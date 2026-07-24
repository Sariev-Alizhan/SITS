// /api/_crm-users.js — учётные записи команды для CRM.
// Имя с _ → Vercel не считает это endpoint'ом.
// Пароли НЕ хранятся: только salted SHA-256 (salt+password). Плейнтекст — у владельца.
// Чтобы сменить пароль/добавить сотрудника — сгенерировать новый salt+hash и заменить запись.

export const USERS = [
  { login: 'alizhan',  name: 'Алижан',      salt: '7212368c04daddd3e2a0bdd0', hash: 'e4dd4beff0fbd8bd7e3b5b7043ffc9b7b5e523d7018799af87dfe561ed6027c5' },
  { login: 'manager1', name: 'Аблай',       salt: '5b728ec23edd0beebcfbfcf7', hash: '19d32da25a2a5735016cc71155244b1946182ac2e9f7a315dc79fa683d57fc95' },
  { login: 'manager2', name: 'Алишер',      salt: '1f06f2e7dee76bf2a1842088', hash: 'c3812d8763133e2a8bf0b91b27216ad175ec5de18d42136e1c5bb99dfe1eded2' },
];

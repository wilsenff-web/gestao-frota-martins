# Gestão de Frota Martins

Sistema web com acesso individual para administrador e motoristas. Os dados continuam no mesmo projeto Supabase, protegidos por autenticação e políticas de acesso.

## Publicação

Execute `python3 build.py`. Em Settings → Pages, selecione Deploy from a branch, branch main, pasta /docs.

Endereço previsto: https://wilsenff-web.github.io/gestao-frota-martins/

O repositório contém somente o aplicativo estático, sem backups, registros de viagens, senhas ou chaves administrativas. A chave publishable é pública por definição; a autorização é feita no servidor.

A função frota-accounts deve aceitar as origens exatas do endereço anterior e de https://wilsenff-web.github.io antes da migração. Mantenha o endereço anterior durante a validação.

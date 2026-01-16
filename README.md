# 🚀 Push Notification Server: Prova de Conceito

Este projeto é uma **prova de conceito** para envio de **push notifications segmentadas** utilizando **Firebase Cloud Messaging (FCM)**.

Ele suporta segmentação por:

  * Múltiplos **parceiros**
  * Múltiplos **ambientes** (`qa`, `staging`, `release`)
  * Múltiplas **versões** do app

A abordagem principal utiliza o **Firebase Topic Messaging** (tópicos), conforme documentado em: [Documentação Firebase Tópicos](https://firebase.google.com/docs/cloud-messaging/topic-messaging?hl=pt).

-----

## 🏗️ Componentes do Sistema

O sistema é composto por dois módulos principais:

  * **Backend Node.js:** Responsável pelo armazenamento dos tokens de dispositivo e pelo envio das mensagens.
  * **Aplicativo Android:** Responsável por gerar o token, enviá-lo ao backend e se inscrever nos tópicos de segmentação.

-----

## 🧩 Arquitetura Geral

### 1\. **Parceiros e Projetos Firebase**

Cada parceiro é configurado como um **projeto Firebase separado**.

  * **Exemplo:** Para este projeto, foram considerados 2 parceiros: `poc1` e `poc2`.
  * **Credenciais:** Cada parceiro deve ter seu próprio arquivo de credenciais (`service-account.json`).

-----

## 🖥️ Lógica do Servidor (Backend)

O backend é o ponto central para o gerenciamento de tokens e o disparo de notificações.

### 1\. **Endpoint de Recebimento de Token**

O servidor recebe e armazena os tokens de dispositivo através do endpoint:
`POST /api/token`

**Campos Esperados:**

  * `studentId`
  * `token` (FCM token)
  * `version` (versão do app)
  * `environment` (`qa`, `staging`, `release`, etc.)
  * `partner`

Esses dados são essenciais para popular o banco de dados e habilitar as estratégias de envio segmentado.

### 2\. **Estratégias de Envio**

A lógica de envio implementa diferentes formas de segmentação, conforme a tabela abaixo:

| Regra de Envio | Quando é Aplicada | Filtro Utilizado | Método de Envio do FCM | Suporte Atual<br>(Serverless e mongo) |
| :--- | :--- | :--- | :--- | :---: |
| **Aluno Individual** | `studentId` fornecido | Tokens associados ao `studentId` | `send` com `token` do aluno | ✔ |
| **Curso** | `course` fornecido e `studentId` não fornecido | `parceiro + ambiente + curso` (+ `version` opcional) | `sendEachForMulticast` com tokens filtrados | ✖ |
| **Versão Específica** | `version` fornecida, sem `studentId` ou `course` | Todos os tokens com `parceiro + ambiente + version` | `sendEachForMulticast` com tokens filtrados | ✖ |
| **Geral por Flavor + Ambiente** | Nenhum `studentId`, `course` ou `version` fornecido | Tópico: `parceiro-ambiente` | `send` via **tópico** (ex: `poc1-qa`) | ✔ |

-----

### 3\. **Observações Técnicas**

  * O método `sendMulticast()` foi substituído por `sendEachForMulticast()` devido à API atual do Firebase Admin SDK v13+.
  * O envio via **tópico** funciona corretamente e é a forma atual de *broadcast*.
  * O envio filtrado por lista de tokens (`sendEachForMulticast`) depende diretamente da **qualidade dos dados** armazenados no banco.
  * **Limitação Atual do DB:** O banco de dados *não* armazena o `parceiro`, `ambiente` e `última versão` para cada token de forma que permita filtragens refinadas baseadas no token (o que impacta as estratégias marcadas com ✖).

> **Nota:** Não há exemplos na documentação oficial do Firebase de envio combinado de tokens e tópicos no método `send` do Admin SDK. Portanto, o suporte para envio simultâneo não é confirmado.

-----

## 📱 Lógica do Aplicativo Android

O aplicativo executa quatro funções críticas para a integração:

### 1\. Solicitação de Permissão (Android 13+)

Solicita a permissão `Manifest.permission.POST_NOTIFICATIONS` ao usuário.

### 2\. Obtenção do FCM Token

Utiliza `FirebaseMessaging.getInstance().token` para obter o token exclusivo do dispositivo, salvando-o no `SharedPreferences`.

### 3\. Envio do Token ao Backend

Realiza uma requisição `POST` para o backend (`http://10.0.2.2:3000/api/token`) com os dados:

  * `studentId`
  * `token`
  * `version`
  * `environment`
  * `partner`

### 4\. Inscrição em Tópicos do FCM

O aplicativo se inscreve automaticamente em um tópico no formato:
$$\text{parceiro-ambiente}$$

  * **Exemplo:** `poc1-qa`

-----

## 🧪 Como Testar o Projeto

### 🖥️ Testando o Backend

1.  **Abrir o Projeto fcm-server** no VSCode ou outro editor de sua preferência.
    
2.  npm install
    
3.  **Colocar os Arquivos de Credenciais Firebase na Raiz do Projeto:**
    
    *   Para cada parceiro (poc1, poc2, etc.), obtenha o arquivo service-account.json correspondente.
        
    *   Renomeie para:
        
        *   service-account-poc1.json
            
        *   service-account-poc2.json
            
    *   Coloque-os na **raiz do projeto**, no mesmo nível do index.js.
       
        
4.  **Executar o Script de Setup das Variáveis de Ambiente:**
    
       ```bash
    source ./setup-env.sh
       ```
        
       ```
    bash .\setup-env.ps1
       ```
        
    *   Esse script carrega as credenciais do Firebase nas variáveis de ambiente usadas pelo servidor.
        
6.  **Rodar o servidor**
     ```bash
      npm run dev
     ```
    
    *   O servidor será iniciado em http://localhost:3000.
        
7.  Servidor rodando na porta 3000

### 📱 Testando o App Android

Para simular a segmentação, utilize múltiplos emuladores, um para cada combinação de parceiro e ambiente.

**Passo a Passo:**

1.  **Abrir o Android Studio.**
2.  **Criar Emuladores:** No **AVD Manager**, crie emuladores para cada variação desejada:
      * Parceiro (`poc1`, `poc2`, etc.)
      * Ambiente (`qa`, `staging`, `release`)
3.  **Rodar o App:** Execute o aplicativo em cada emulador.
4.  **Verificação:** Na tela do app, verifique os dados exibidos: **Partner**, **Environment**, **Version** e **Token**.
5.  **Observação:** Para rodar o **app release**, será necessário ter o arquivo de credenciais.

-----

## 🌐 Exemplo de cURL para Envio

Aqui está um exemplo de como disparar uma notificação segmentada por **curso e versão**:

```bash
curl -X POST http://localhost:3000/api/push \
  -H "Content-Type: application/json" \
  -d '{
    "partner": "poc1",
    "environment": "staging",
    "title": "Push por curso e versão",
    "message": "Todos desse curso e versão",
    "version": "2.0",
    "course": "456"
  }'
```





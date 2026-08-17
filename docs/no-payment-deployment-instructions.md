Deploy the bookkeeper with no payment method
Robots Helper AI Bookkeeper
No-Payment Deployment Instructions for Romel
Hi Romel,
I want to test the AI Bookkeeper myself before we add any payment information.
For now, do not add a credit card, debit card, or Cloud Billing account.
We are going to use Google AI Studio's no-cost Starter Tier deployment if it is available for this project.
Do not upgrade the project to Firebase Blaze.
Do not use Firebase App Hosting.

STEP 1 — Confirm the Current Google AI Studio Project
Open the existing Robots Helper AI Bookkeeper project in Google AI Studio.
Do not create a new project unless the current project cannot be deployed.
Make sure the existing application is still connected to:
Gemini
Firebase Authentication
Cloud Firestore
The application must continue using the existing Firebase project and database.

STEP 2 — Check Firebase Billing
Open the Firebase project associated with the application.
Go to:
Firebase Console → Project Settings → Usage and Billing
Confirm that the project is still on:
Spark — No-cost plan
Do NOT click:
Upgrade
Upgrade to Blaze
Set up billing
Add billing account
If Google asks for a payment method, stop and tell me.

STEP 3 — Verify Firebase Authentication
Make sure Email/Password authentication is still enabled.
Test:
Create a test account.
Log in.
Log out.
Log back in.
Do not use my real financial information for testing.
Use test transactions.

STEP 4 — Verify Firestore
Make sure Cloud Firestore is connected to the existing application.
Use test data only.
For example:
Personal:
₱1,500 — Groceries
Business:
$37 — Hosting
Confirm that the transactions are actually being saved to Firestore.

STEP 5 — Do NOT Use Firebase App Hosting
This is very important.
Do NOT click:
"Publish" if it takes us into Firebase App Hosting and asks for a Cloud Billing account.
Firebase App Hosting requires billing.
We are not using App Hosting right now.

STEP 6 — Use Google AI Studio Starter Tier Deployment
In Google AI Studio Build Mode, look for the deployment/publishing option.
Choose the Starter Tier / no-billing deployment option, if presented.
Google's current documentation says the Starter Tier can publish up to two full-stack applications without setting up a Google Cloud project or billing account.
If Google AI Studio gives an option that says:
Starter Tier
or
No billing required
choose that option.

STEP 7 — STOP IF BILLING IS REQUIRED
If Google AI Studio asks for:
Credit card
Debit card
Payment method
Cloud Billing account
Blaze plan
Paid billing account
DO NOT proceed.
Do not enter any payment information.
Take a screenshot of the screen and send it to me.

STEP 8 — Deploy
If the Starter Tier deployment is available, deploy the current application.
Wait for the deployment to complete.
Google AI Studio should provide a web address for the deployed application.
Copy that URL.

STEP 9 — Test the Deployed Application
Open the URL in a separate browser window.
Test the following:
Personal
Say:
"I spent 1,500 pesos on groceries."
Expected:
Personal
PHP
Expense
₱1,500
Groceries

Business
Say:
"I paid 37 dollars for hosting."
Expected:
Business
USD
Expense
$37
Hosting

Business Income
Say:
"I received 500 dollars from XYZ Solar Company."
Expected:
Business
USD
Income
$500
Client:
XYZ Solar Company

Accountant
Ask:
"How much did I spend on hosting?"
The answer must come from the actual Firestore data.

STEP 10 — Test Voice
Make sure the deployed version can:
Hear my voice.
Convert speech to text.
Send the request to Gemini.
Understand the request.
Save the transaction.
Give me a spoken response.

STEP 11 — Verify Data Security
Make sure the deployed application still uses the Firebase Authentication user ID.
A user's transactions must remain associated with that user.
Do not make Firestore publicly readable or writable just to make the deployment work.
Keep the existing Firebase Security Rules.

STEP 12 — Send Me the Test Information
When finished, send me:
The deployed application URL.
Confirmation that no payment information was added.
Confirmation that Firebase is still on the Spark plan.
Confirmation that the application is connected to Firestore.
Confirmation that voice input works.
Confirmation that Bookkeeper Mode works.
Confirmation that Accountant Mode works.
Any errors or limitations you encountered.
If Google requires billing at any point, STOP and tell me exactly what screen or message appeared.
Do not add a payment method without my approval.

IMPORTANT
This is only a personal test deployment.
Do not optimize for production yet.
Do not add paid services.
Do not upgrade Firebase.
Do not add a credit card.
The immediate goal is simply:
Get the existing AI Bookkeeper online so I can personally test it.
Once I have tested it and we're satisfied with the basic operation, we'll decide whether we need paid services or a different deployment method.

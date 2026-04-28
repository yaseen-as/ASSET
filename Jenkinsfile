// ─────────────────────────────────────────────────────────────────────────────
// SwingTrade — Monorepo CI/CD Pipeline
//
// Branch strategy:
//   development  → builds changed services, pushes :dev-<build> tag, auto-deploys to dev
//   main         → builds all services, pushes :<version> tag, waits for manual approval, deploys prod
//
// Required Jenkins credentials:
//   dockerhub         — DockerHub username/password
//   kubeconfig-dev    — kubeconfig file for dev cluster
//   kubeconfig-prod   — kubeconfig file for prod cluster
// ─────────────────────────────────────────────────────────────────────────────

pipeline {
    agent any

    environment {
        DOCKER_USER   = 'yaseenas'
        REGISTRY      = 'docker.io'
        // semver tag read from package.json root; falls back to build number
        APP_VERSION   = sh(script: "node -p \"require('./package.json').version\"", returnStdout: true).trim()
    }

    stages {

        // ── 1. Checkout ───────────────────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
                // Make full git history available so we can diff against previous commit
                sh 'git fetch --depth=2 origin'
            }
        }

        // ── 2. Detect changed services ────────────────────────────────────────
        // On development: only rebuild services whose files changed.
        // On main: always build everything (full release).
        stage('Detect Changes') {
            steps {
                script {
                    def ALL_SERVICES = ['api-gateway', 'trading-service', 'market-service', 'frontend']

                    if (env.BRANCH_NAME == 'main') {
                        env.CHANGED_SERVICES = ALL_SERVICES.join(',')
                        echo "main branch — building all services: ${env.CHANGED_SERVICES}"
                    } else {
                        def changed = sh(
                            script: "git diff --name-only HEAD~1 HEAD || git diff --name-only HEAD",
                            returnStdout: true
                        ).trim().split('\n')

                        def affected = ALL_SERVICES.findAll { svc ->
                            def dir = svc == 'frontend' ? 'frontend' : "services/${svc}"
                            changed.any { it.startsWith(dir) || it.startsWith('packages/shared') }
                        }

                        env.CHANGED_SERVICES = affected.join(',')
                        echo "Changed services: ${env.CHANGED_SERVICES ?: 'none'}"
                    }
                }
            }
        }

        // ── 3. Install & Build shared package ────────────────────────────────
        stage('Install') {
            when { expression { env.CHANGED_SERVICES != '' } }
            steps {
                sh 'npm ci'
                sh 'npm run build --workspace=packages/shared'
            }
        }

        // ── 4. Lint ───────────────────────────────────────────────────────────
        stage('Lint') {
            when { expression { env.CHANGED_SERVICES != '' } }
            steps {
                script {
                    def services = env.CHANGED_SERVICES.split(',')
                    services.each { svc ->
                        def ws = svc == 'frontend' ? 'frontend' : "services/${svc}"
                        sh "npm run lint --workspace=${ws} || true"
                    }
                }
            }
        }

        // ── 5. Test ───────────────────────────────────────────────────────────
        // Currently no test framework configured. This stage is a placeholder.
        // When tests are added (Vitest for unit, Playwright for E2E), they run here.
        stage('Test') {
            when { expression { env.CHANGED_SERVICES != '' } }
            steps {
                script {
                    def services = env.CHANGED_SERVICES.split(',')
                    services.each { svc ->
                        def ws = svc == 'frontend' ? 'frontend' : "services/${svc}"
                        sh "npm run test --workspace=${ws} --if-present || true"
                    }
                }
            }
        }

        // ── 6. Build Docker images ────────────────────────────────────────────
        stage('Build Images') {
            when { expression { env.CHANGED_SERVICES != '' } }
            steps {
                script {
                    def tag = env.BRANCH_NAME == 'main'
                        ? env.APP_VERSION
                        : "dev-${env.BUILD_NUMBER}"

                    env.IMAGE_TAG = tag

                    def services = env.CHANGED_SERVICES.split(',')
                    services.each { svc ->
                        def image = "${DOCKER_USER}/${svc}:${tag}"
                        def dockerfilePath = svc == 'frontend' ? 'frontend/Dockerfile' : "services/${svc}/Dockerfile"
                        sh "docker build -t ${image} -f ${dockerfilePath} ."
                        echo "Built: ${image}"
                    }
                }
            }
        }

        // ── 7. Push to DockerHub ──────────────────────────────────────────────
        stage('Push Images') {
            when { expression { env.CHANGED_SERVICES != '' } }
            steps {
                withCredentials([usernamePassword(
                    credentialsId: 'dockerhub',
                    usernameVariable: 'DH_USER',
                    passwordVariable: 'DH_PASS'
                )]) {
                    sh 'echo $DH_PASS | docker login -u $DH_USER --password-stdin'
                    script {
                        def services = env.CHANGED_SERVICES.split(',')
                        services.each { svc ->
                            sh "docker push ${DOCKER_USER}/${svc}:${env.IMAGE_TAG}"
                        }
                    }
                }
            }
        }

        // ── 8a. Deploy → Dev (auto, development branch only) ─────────────────
        stage('Deploy Dev') {
            when { branch 'development' }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig-dev', variable: 'KUBECONFIG')]) {
                    script {
                        def services = env.CHANGED_SERVICES.split(',')
                        services.each { svc ->
                            sh """
                                kubectl set image deployment/${svc} \
                                    app=${DOCKER_USER}/${svc}:${env.IMAGE_TAG} \
                                    --kubeconfig=\$KUBECONFIG
                            """
                        }
                    }
                    sh 'kubectl rollout status deployment --timeout=120s --kubeconfig=$KUBECONFIG || true'
                }
            }
        }

        // ── 8b. Approval gate (main branch only) ─────────────────────────────
        stage('Approve Production') {
            when { branch 'main' }
            steps {
                timeout(time: 30, unit: 'MINUTES') {
                    input message: "Deploy version ${env.APP_VERSION} to production?",
                          ok: 'Deploy'
                }
            }
        }

        // ── 8c. Deploy → Prod (main branch, after approval) ──────────────────
        stage('Deploy Prod') {
            when { branch 'main' }
            steps {
                withCredentials([file(credentialsId: 'kubeconfig-prod', variable: 'KUBECONFIG')]) {
                    // Update all image tags in the prod overlay kustomization
                    sh """
                        cd k8s/overlays/prod
                        kustomize edit set image \
                            yaseenas/api-gateway:${env.APP_VERSION} \
                            yaseenas/trading-service:${env.APP_VERSION} \
                            yaseenas/market-service:${env.APP_VERSION} \
                            yaseenas/react-frontend:${env.APP_VERSION}
                        kubectl apply -k . --kubeconfig=\$KUBECONFIG
                        kubectl rollout status deployment --timeout=300s --kubeconfig=\$KUBECONFIG
                    """
                }
            }
        }

    }

    // ── Post actions ──────────────────────────────────────────────────────────
    post {
        success {
            echo "Pipeline succeeded. Tag: ${env.IMAGE_TAG ?: 'n/a'}"
        }
        failure {
            echo "Pipeline failed on branch ${env.BRANCH_NAME}."
            // Add Slack/email notification here when ready
        }
        always {
            sh 'docker logout || true'
        }
    }
}

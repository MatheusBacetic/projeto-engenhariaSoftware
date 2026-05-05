from locust import HttpUser, task, between

class EvoPGUser(HttpUser):
    wait_time = between(1, 5)
    
    @task
    def access_home(self):
        """Simula acesso à página inicial"""
        with self.client.get("/index.html", catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Falha ao carregar Home: {response.status_code}")

    @task(2)
    def access_profile(self):
        """Simula acesso ao perfil (mais frequente para usuários logados)"""
        self.client.get("/perfil.html")

# Para rodar: locust -f locustfile.py --host=http://localhost:5500

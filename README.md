# siridl-pap

Auditoria Rodoviária Inteligente (DL + Dados Geoespaciais)
O Problema Real: Câmaras municipais gastam milhares de euros em auditorias externas manuais para fiscalizar buracos, tampas de esgoto desniveladas e sinalização de trânsito degradada nas estradas.

A Solução: Um sistema instalado num telemóvel ou câmara fixada no tablier de veículos da autarquia (ex.: carrinhas de recolha de lixo ou de fiscalização). Conforme o veículo circula, um modelo de Deep Learning deteta fissuras, buracos no pavimento e sinais danificados, registando a imagem, gravidade e coordenadas GPS exatas num mapa interativo para a equipa de obras públicas.

Stack Técnica:

Deep Learning: YOLOv8/YOLOv11 para deteção de múltiplos tipos de anomalias viárias em vídeo a 30 FPS.

Geolocalização & Backend: Python, FastAPI e base de dados PostgreSQL com extensão PostGIS para consultas espaciais eficientes.

Visualização: Frontend em Next.js com integração de mapas vetoriais (Leaflet ou Mapbox).

Por que impressiona o Júri: Une visão computacional com sistemas de informação geográfica (SIG) para resolver um problema visível de gestão autárquica.

Modelo de Negócio: Modelo B2G (Business to Government) cobrado como subscrição anual de auditoria e inventário viário (€400 a €1.200/mês por município).
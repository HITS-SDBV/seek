#MySQL
{% for db in mysql_databases %}
{{ db.name | replace("seek_","") }}:
  adapter:  mysql2
  database: {{ db.name }}
  username: {{ mysql_users[0].name }}
  password: {{ mysql_users[0].password }}

{% endfor %}

# SQLite version 3.x
#   gem install sqlite3-ruby (not necessary on OS X Leopard)
#development:
#  adapter: sqlite3
#  database: db/development.sqlite3
#  timeout: 5000 

#test:
#  adapter: sqlite3
#  database: db/test.sqlite3
#  timeout: 5000
#
#production:
#  adapter: sqlite3
#  database: db/production.sqlite3
#  timeout: 5000

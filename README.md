<div align="center">
    <div>
        <picture>
            <source media="(prefers-color-scheme: dark)" srcset="./images/title-w.svg"/>
            <img src="./images/title.svg" width="320"/>
        </picture>
    </div>
    Intermediary Service for Pathfinder Applications
    <br/><br/><br/>
</div>


## Documents

* [Architecture](https://mill6-plat6aux.github.io/harmony/architecture/architecture.html)
* [API Reference](https://mill6-plat6aux.github.io/harmony/reference/api.html)
* [Client API Reference](https://mill6-plat6aux.github.io/harmony/reference/client-api.html)


## Launch with Docker

Create the network to access Pathfinder applications; Pathfinder applications should also be deployed within this network.

```sh
docker network create harmony_network
```

Launch the web server and database.

```sh
docker compose up
```


## License

[MIT](LICENSE)


## Developers

[Takuro Okada](mailto:mill6.plat6aux@gmail.com)


---

&copy; Takuro Okada
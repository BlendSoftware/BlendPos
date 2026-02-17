package handler

import (
	"net/http"

	"blendpos/internal/apierror"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/validator/v10"
)

var validate = validator.New()

// bindAndValidate binds JSON body and runs go-playground/validator tags.
// Returns false and writes the error response if validation fails —
// the caller should return immediately without writing another response.
func bindAndValidate(c *gin.Context, req interface{}) bool {
	if err := c.ShouldBindJSON(req); err != nil {
		c.JSON(http.StatusBadRequest, apierror.New("JSON invalido: "+err.Error()))
		return false
	}
	if err := validate.Struct(req); err != nil {
		fields := make(map[string]string)
		for _, fe := range err.(validator.ValidationErrors) {
			fields[fe.Field()] = fe.Tag()
		}
		c.JSON(http.StatusUnprocessableEntity, apierror.NewValidation(fields))
		return false
	}
	return true
}
